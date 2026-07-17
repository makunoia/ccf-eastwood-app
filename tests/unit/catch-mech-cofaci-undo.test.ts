import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

// auth() is globally mocked to a SuperAdmin session in tests/setup.ts, so canWrite passes.

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"
import { getSessionData } from "@/app/events/[id]/catch-mech/[token]/page"
import { reopenCatchMechRequest } from "@/app/(event)/event/[id]/catch-mech/matching-actions"

/**
 * Seeds an event with a breakout group that has a LEAD facilitator (whose group is
 * the breakout's linked group) and a CO-facilitator (with their own led group), plus
 * catch-mech sessions for each. Returns the ids/tokens needed per test.
 */
async function seedScaffold() {
  const event = await db.event.create({
    data: { name: "E", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const leadMember = await db.member.create({
    data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
  })
  const coMember = await db.member.create({
    data: { firstName: "Co", lastName: "Faci", dateJoined: new Date(), language: [] },
  })
  const leadGroup = await db.smallGroup.create({
    data: { name: "Lead's Group", leaderId: leadMember.id, status: "Active" },
  })
  const coGroup = await db.smallGroup.create({
    data: { name: "Co's Group", leaderId: coMember.id, status: "Active" },
  })
  const committee = await db.volunteerCommittee.create({ data: { name: "Facis", eventId: event.id } })
  const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id } })
  const leadVol = await db.volunteer.create({
    data: { memberId: leadMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
  })
  const coVol = await db.volunteer.create({
    data: { memberId: coMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
  })
  const breakout = await db.breakoutGroup.create({
    data: {
      name: "Table 1",
      eventId: event.id,
      facilitatorId: leadVol.id,
      coFacilitatorId: coVol.id,
      linkedSmallGroupId: leadGroup.id,
    },
  })
  const leadSession = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: leadVol.id },
  })
  const coSession = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: coVol.id },
  })
  return { event, leadMember, coMember, leadGroup, coGroup, breakout, leadSession, coSession }
}

async function addGuestRegistrant(eventId: string, breakoutId: string, firstName: string) {
  const guest = await db.guest.create({ data: { firstName, lastName: "Guest", language: [] } })
  const reg = await db.eventRegistrant.create({ data: { eventId, guestId: guest.id } })
  await db.breakoutGroupMember.create({ data: { breakoutGroupId: breakoutId, registrantId: reg.id } })
  return { guest, reg }
}

describe("catch-mech — independent co-facilitator decisions + admin undo", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
        "Volunteer", "CommitteeRole", "VolunteerCommittee",
        "EventRegistrant", "Guest", "SmallGroupMemberRequest",
        "SmallGroupLog", "SmallGroup", "Member",
        "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it("a lead's rejection still lets the co-facilitator see (and the rejecting lead not see) the person", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")

    const res = await submitCatchMechConfirmations(s.leadSession.token, [
      { registrantId: reg.id, status: "declined", declineReason: "NotInterested" },
    ])
    expect(res.success).toBe(true)

    // Rejection is recorded against the LEAD's group, with the lead as group leader.
    const rejected = await db.smallGroupMemberRequest.findFirst({
      where: { guestId: guest.id, status: "Rejected" },
      select: { smallGroupId: true, smallGroup: { select: { leaderId: true } } },
    })
    expect(rejected?.smallGroupId).toBe(s.leadGroup.id)
    expect(rejected?.smallGroup?.leaderId).toBe(s.leadMember.id)

    // Co-faci still sees the person; the lead who rejected does not.
    const coData = await getSessionData(s.coSession.token)
    const leadData = await getSessionData(s.leadSession.token)
    expect(coData?.rows.map((r) => r.registrantId)).toContain(reg.id)
    expect(leadData?.rows.map((r) => r.registrantId)).not.toContain(reg.id)
  })

  it("undoing a rejection reopens it to Pending and clears the reason", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    await submitCatchMechConfirmations(s.leadSession.token, [
      { registrantId: reg.id, status: "declined", declineReason: "Unresponsive" },
    ])
    const rejected = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { guestId: guest.id, status: "Rejected" },
    })

    const res = await reopenCatchMechRequest(rejected.id, s.event.id)
    expect(res.success).toBe(true)

    const after = await db.smallGroupMemberRequest.findUnique({ where: { id: rejected.id } })
    expect(after?.status).toBe("Pending")
    expect(after?.declineReason).toBeNull()
    expect(after?.resolvedAt).toBeNull()
  })

  it("undoing a confirmed promoted guest deletes the member and restores the guest", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    await submitCatchMechConfirmations(s.leadSession.token, [
      { registrantId: reg.id, status: "confirmed" },
    ])
    const confirmed = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { status: "Confirmed" },
      select: { id: true, memberId: true },
    })
    expect(confirmed.memberId).not.toBeNull()

    const res = await reopenCatchMechRequest(confirmed.id, s.event.id)
    expect(res.success).toBe(true)

    // Member deleted, guest restored, registrant rewired, request Pending w/ guestId
    const deletedMember = await db.member.findUnique({ where: { id: confirmed.memberId! } })
    expect(deletedMember).toBeNull()
    const freshGuest = await db.guest.findUnique({ where: { id: guest.id } })
    expect(freshGuest?.memberId).toBeNull()
    const freshReg = await db.eventRegistrant.findUnique({ where: { id: reg.id } })
    expect(freshReg?.guestId).toBe(guest.id)
    expect(freshReg?.memberId).toBeNull()
    const after = await db.smallGroupMemberRequest.findUnique({ where: { id: confirmed.id } })
    expect(after?.status).toBe("Pending")
    expect(after?.guestId).toBe(guest.id)
    expect(after?.memberId).toBeNull()
  })

  it("undoing a confirmed existing member removes them from the group but keeps the member", async () => {
    const s = await seedScaffold()
    // A real member (not promoted from a guest) sitting in the breakout
    const existing = await db.member.create({
      data: { firstName: "Mark", lastName: "Member", dateJoined: new Date(), language: [] },
    })
    const reg = await db.eventRegistrant.create({ data: { eventId: s.event.id, memberId: existing.id } })
    await db.breakoutGroupMember.create({ data: { breakoutGroupId: s.breakout.id, registrantId: reg.id } })

    await submitCatchMechConfirmations(s.leadSession.token, [
      { registrantId: reg.id, status: "confirmed" },
    ])
    const placed = await db.member.findUnique({ where: { id: existing.id } })
    expect(placed?.smallGroupId).toBe(s.leadGroup.id)
    const confirmed = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: existing.id, status: "Confirmed" },
    })

    const res = await reopenCatchMechRequest(confirmed.id, s.event.id)
    expect(res.success).toBe(true)

    const after = await db.member.findUnique({ where: { id: existing.id } })
    expect(after).not.toBeNull()
    expect(after?.smallGroupId).toBeNull()
    expect(after?.groupStatus).toBeNull()
    const req = await db.smallGroupMemberRequest.findUnique({ where: { id: confirmed.id } })
    expect(req?.status).toBe("Pending")
  })
})

describe("catch-mech — edge cases & regressions", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.$executeRaw`
      TRUNCATE
        "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
        "Volunteer", "CommitteeRole", "VolunteerCommittee",
        "EventRegistrant", "Guest", "SmallGroupMemberRequest",
        "SmallGroupLog", "SmallGroup", "Member",
        "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it("a CONFIRMED person is hidden from both the lead and the co-facilitator", async () => {
    const s = await seedScaffold()
    const { reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    // Co-faci confirms into their own group → person is placed
    await submitCatchMechConfirmations(s.coSession.token, [{ registrantId: reg.id, status: "confirmed" }])

    const coData = await getSessionData(s.coSession.token)
    const leadData = await getSessionData(s.leadSession.token)
    expect(coData?.rows.map((r) => r.registrantId)).not.toContain(reg.id)
    expect(leadData?.rows.map((r) => r.registrantId)).not.toContain(reg.id)
  })

  it("a Timothy co-facilitator (no led group) still sees a lead-rejected person", async () => {
    // Custom scaffold: co-faci leads NO group (Timothy)
    const event = await db.event.create({ data: { name: "E", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const leadMember = await db.member.create({ data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] } })
    const coMember = await db.member.create({ data: { firstName: "Tim", lastName: "Othy", dateJoined: new Date(), language: [] } })
    const leadGroup = await db.smallGroup.create({ data: { name: "Lead's Group", leaderId: leadMember.id, status: "Active" } })
    const committee = await db.volunteerCommittee.create({ data: { name: "Facis", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id } })
    const leadVol = await db.volunteer.create({ data: { memberId: leadMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
    const coVol = await db.volunteer.create({ data: { memberId: coMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
    const breakout = await db.breakoutGroup.create({ data: { name: "T1", eventId: event.id, facilitatorId: leadVol.id, coFacilitatorId: coVol.id, linkedSmallGroupId: leadGroup.id } })
    const leadSession = await db.catchMechSession.create({ data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: leadVol.id } })
    const coSession = await db.catchMechSession.create({ data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: coVol.id } })
    const { reg } = await addGuestRegistrant(event.id, breakout.id, "Gina")

    await submitCatchMechConfirmations(leadSession.token, [{ registrantId: reg.id, status: "declined", declineReason: "NotInterested" }])

    const coData = await getSessionData(coSession.token)
    expect(coData?.isTimothy).toBe(true)
    expect(coData?.rows.map((r) => r.registrantId)).toContain(reg.id)
  })

  it("lead rejects then co-faci confirms the same guest — confirm wins, lead's rejected record persists", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    await submitCatchMechConfirmations(s.leadSession.token, [{ registrantId: reg.id, status: "declined", declineReason: "NotInterested" }])
    const res = await submitCatchMechConfirmations(s.coSession.token, [{ registrantId: reg.id, status: "confirmed" }])
    expect(res.success).toBe(true)

    // Guest promoted into the co-faci's group
    const freshGuest = await db.guest.findUnique({ where: { id: guest.id }, select: { memberId: true } })
    expect(freshGuest?.memberId).not.toBeNull()
    const placed = await db.member.findUnique({ where: { id: freshGuest!.memberId! }, select: { smallGroupId: true } })
    expect(placed?.smallGroupId).toBe(s.coGroup.id)
    // The lead's earlier rejection record is retained as history
    const leadReject = await db.smallGroupMemberRequest.findFirst({ where: { smallGroupId: s.leadGroup.id, status: "Rejected" } })
    expect(leadReject).not.toBeNull()
  })

  it("undoing a confirmed guest who registered for a SECOND event rewires both registrations", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    const otherEvent = await db.event.create({ data: { name: "E2", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const reg2 = await db.eventRegistrant.create({ data: { eventId: otherEvent.id, guestId: guest.id } })

    await submitCatchMechConfirmations(s.leadSession.token, [{ registrantId: reg.id, status: "confirmed" }])
    const confirmed = await db.smallGroupMemberRequest.findFirstOrThrow({ where: { status: "Confirmed" }, select: { id: true, memberId: true } })

    const res = await reopenCatchMechRequest(confirmed.id, s.event.id)
    expect(res.success).toBe(true)

    expect(await db.member.findUnique({ where: { id: confirmed.memberId! } })).toBeNull()
    const r1 = await db.eventRegistrant.findUnique({ where: { id: reg.id } })
    const r2 = await db.eventRegistrant.findUnique({ where: { id: reg2.id } })
    expect(r1?.guestId).toBe(guest.id)
    expect(r1?.memberId).toBeNull()
    expect(r2?.guestId).toBe(guest.id)
    expect(r2?.memberId).toBeNull()
  })

  it("returns an error for a non-existent request", async () => {
    const s = await seedScaffold()
    const res = await reopenCatchMechRequest("does-not-exist", s.event.id)
    expect(res.success).toBe(false)
  })

  it("refuses to undo a Pending (un-decided) request", async () => {
    const s = await seedScaffold()
    const { guest } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    const pending = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: s.leadGroup.id, guestId: guest.id, breakoutGroupId: s.breakout.id, status: "Pending" },
    })
    const res = await reopenCatchMechRequest(pending.id, s.event.id)
    expect(res.success).toBe(false)
    const after = await db.smallGroupMemberRequest.findUnique({ where: { id: pending.id } })
    expect(after?.status).toBe("Pending")
  })

  it("rejects an unauthorized (no SmallGroups write) user and makes no changes", async () => {
    const s = await seedScaffold()
    const { guest, reg } = await addGuestRegistrant(s.event.id, s.breakout.id, "Gina")
    await submitCatchMechConfirmations(s.leadSession.token, [{ registrantId: reg.id, status: "declined", declineReason: "NotInterested" }])
    const rejected = await db.smallGroupMemberRequest.findFirstOrThrow({ where: { guestId: guest.id, status: "Rejected" } })

    // Staff user with no SmallGroups permission for this one call
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "staff", role: "Staff", permissions: [], eventAccess: [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const res = await reopenCatchMechRequest(rejected.id, s.event.id)
    expect(res.success).toBe(false)
    const after = await db.smallGroupMemberRequest.findUnique({ where: { id: rejected.id } })
    expect(after?.status).toBe("Rejected")
  })
})
