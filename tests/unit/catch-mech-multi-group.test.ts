/**
 * Catch Mech confirmation flow for facilitators who lead several small groups, and
 * for Timothys who lead none.
 *
 * Regressions pinned here:
 *  - A faci leading 2+ groups with no linked breakout could not submit at all; the
 *    action hard-errored and the form bounced them back to the member list.
 *  - A Timothy who declined everyone got a "Done!" screen while nothing was written,
 *    so the same names reappeared on their next visit.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  submitCatchMechConfirmations,
  createSmallGroupForTimothy,
  type ConfirmDecision,
} from "@/app/events/[id]/catch-mech/actions"
import { getSessionData } from "@/app/events/[id]/catch-mech/[token]/page"
import { SLUG_CONFIG } from "@/app/(event)/event/[id]/catch-mech/status-slug"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "Member", "Guest", "SmallGroup", "BreakoutGroup", "Volunteer", "VolunteerCommittee", "CommitteeRole", "EventRegistrant", "BreakoutGroupMember", "CatchMechSession", "SmallGroupMemberRequest", "SmallGroupLog" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

type SeedOpts = {
  /** Names of small groups the faci leads, created in order (earliest first). */
  ledGroups?: string[]
  /** Link the breakout to the led group at this index. */
  linkTo?: number
  /** Extra attendees beyond the default one. */
  extraAttendees?: number
}

async function seed(opts: SeedOpts = {}) {
  const event = await db.event.create({
    data: { name: "Catch Mech Night", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const faci = await db.member.create({
    data: { firstName: "Faci", lastName: "One", dateJoined: new Date(), language: [] },
  })

  const ledGroups = []
  for (const name of opts.ledGroups ?? []) {
    ledGroups.push(
      await db.smallGroup.create({ data: { name, leaderId: faci.id, language: [] } })
    )
  }

  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const vol = await db.volunteer.create({
    data: {
      memberId: faci.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })

  const breakout = await db.breakoutGroup.create({
    data: {
      eventId: event.id,
      name: "Table 1",
      facilitatorId: vol.id,
      language: [],
      ...(opts.linkTo !== undefined ? { linkedSmallGroupId: ledGroups[opts.linkTo].id } : {}),
    },
  })

  const attendees = []
  for (let i = 0; i < 1 + (opts.extraAttendees ?? 0); i++) {
    const guest = await db.guest.create({
      data: {
        firstName: `Guest${i}`,
        lastName: "Attendee",
        language: [],
        phone: `+63 917 000 00${i}0`,
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: breakout.id, registrantId: registrant.id },
    })
    attendees.push({ guest, registrant })
  }

  const session = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: vol.id },
  })

  return { event, faci, ledGroups, vol, breakout, attendees, session }
}

const declineOf = (registrantId: string): ConfirmDecision => ({
  registrantId,
  status: "declined",
  declineReason: "NotInterested",
})

describe("confirming into a group at its member limit", () => {
  it("REGRESSION: a facilitator's confirm goes through even when the group is full", async () => {
    // A full group used to silently drop the confirm — no member, no request, no
    // error — so the guest stayed on the form and never transitioned. Only the one
    // facilitator whose group had a memberLimit hit it.
    const s = await seed({ ledGroups: ["Full Group"] })
    await db.smallGroup.update({
      where: { id: s.ledGroups[0].id },
      data: { memberLimit: 1 },
    })
    await db.member.create({
      data: {
        firstName: "Existing",
        lastName: "Member",
        dateJoined: new Date(),
        language: [],
        smallGroupId: s.ledGroups[0].id,
        groupStatus: "Member",
      },
    })

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed" },
    ])
    expect(result).toEqual({ success: true, requiresGroupName: false })

    // The guest was promoted and placed despite the group being over its limit.
    const promoted = await db.guest.findUnique({
      where: { id: s.attendees[0].guest.id },
      select: { member: { select: { smallGroupId: true } } },
    })
    expect(promoted?.member?.smallGroupId).toBe(s.ledGroups[0].id)

    const confirmed = await db.smallGroupMemberRequest.findFirst({ where: { status: "Confirmed" } })
    expect(confirmed).not.toBeNull()

    // And they no longer appear on the facilitator's form.
    const data = await getSessionData(s.session.token)
    expect(data?.rows).toHaveLength(0)
  })
})

describe("faci leading multiple small groups", () => {
  it("REGRESSION: submits instead of hard-erroring when unlinked and leading 2+ groups", async () => {
    const s = await seed({ ledGroups: ["Makati East", "BGC Young Pros"] })

    const result = await submitCatchMechConfirmations(s.session.token, [
      declineOf(s.attendees[0].registrant.id),
    ])

    expect(result).toEqual({ success: true, requiresGroupName: false })
    const reqs = await db.smallGroupMemberRequest.findMany()
    expect(reqs).toHaveLength(1)
    expect(reqs[0].status).toBe("Rejected")
    // Not picked for — falls back to the earliest-created group.
    expect(reqs[0].smallGroupId).toBe(s.ledGroups[0].id)
  })

  it("routes each confirmed person to the group the faci picked", async () => {
    const s = await seed({ ledGroups: ["Makati East", "BGC Young Pros"], extraAttendees: 1 })

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed", targetGroupId: s.ledGroups[0].id },
      { registrantId: s.attendees[1].registrant.id, status: "confirmed", targetGroupId: s.ledGroups[1].id },
    ])
    expect(result).toEqual({ success: true, requiresGroupName: false })

    // Each guest was promoted into the group chosen for them.
    const first = await db.guest.findUnique({
      where: { id: s.attendees[0].guest.id },
      select: { member: { select: { smallGroupId: true } } },
    })
    const second = await db.guest.findUnique({
      where: { id: s.attendees[1].guest.id },
      select: { member: { select: { smallGroupId: true } } },
    })
    expect(first?.member?.smallGroupId).toBe(s.ledGroups[0].id)
    expect(second?.member?.smallGroupId).toBe(s.ledGroups[1].id)
  })

  it("rejects a confirmation with no group chosen", async () => {
    const s = await seed({ ledGroups: ["Makati East", "BGC Young Pros"] })

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed" },
    ])

    expect(result.success).toBe(false)
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("rejects a group the faci does not lead", async () => {
    const s = await seed({ ledGroups: ["Makati East", "BGC Young Pros"] })
    const foreign = await db.smallGroup.create({ data: { name: "Someone Else's", language: [] } })

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed", targetGroupId: foreign.id },
    ])

    expect(result.success).toBe(false)
    const members = await db.member.count({ where: { smallGroupId: foreign.id } })
    expect(members).toBe(0)
  })

  it("still offers the picker when the breakout is linked, defaulting to the link", async () => {
    const s = await seed({ ledGroups: ["Makati East", "BGC Young Pros"], linkTo: 1 })

    const data = await getSessionData(s.session.token)
    expect(data?.candidates.map((c) => c.id)).toEqual([s.ledGroups[1].id, s.ledGroups[0].id])

    // The faci can override the link and absorb into their other group.
    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed", targetGroupId: s.ledGroups[0].id },
    ])
    expect(result).toEqual({ success: true, requiresGroupName: false })
    const guest = await db.guest.findUnique({
      where: { id: s.attendees[0].guest.id },
      select: { member: { select: { smallGroupId: true } } },
    })
    expect(guest?.member?.smallGroupId).toBe(s.ledGroups[0].id)
  })

  it("does not require a picker when the faci leads exactly one group", async () => {
    const s = await seed({ ledGroups: ["Makati East"] })

    const data = await getSessionData(s.session.token)
    expect(data?.candidates).toHaveLength(1)

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "confirmed" },
    ])
    expect(result).toEqual({ success: true, requiresGroupName: false })
  })
})

describe("Timothy who leads no group", () => {
  it("REGRESSION: persists declines instead of silently dropping them", async () => {
    const s = await seed({ ledGroups: [] })

    const result = await submitCatchMechConfirmations(s.session.token, [
      declineOf(s.attendees[0].registrant.id),
    ])
    expect(result).toEqual({ success: true, requiresGroupName: false })

    const reqs = await db.smallGroupMemberRequest.findMany()
    expect(reqs).toHaveLength(1)
    expect(reqs[0].status).toBe("Rejected")
    expect(reqs[0].smallGroupId).toBeNull()
    expect(reqs[0].declineReason).toBe("NotInterested")
    expect(reqs[0].declinedByVolunteerId).toBe(s.vol.id)
  })

  it("REGRESSION: a declined person does not reappear on the Timothy's next visit", async () => {
    const s = await seed({ ledGroups: [] })
    await submitCatchMechConfirmations(s.session.token, [declineOf(s.attendees[0].registrant.id)])

    const data = await getSessionData(s.session.token)
    expect(data?.rows).toHaveLength(0)
  })

  it("keeps the free-text reason when declining with Others", async () => {
    const s = await seed({ ledGroups: [] })

    const result = await submitCatchMechConfirmations(s.session.token, [
      { registrantId: s.attendees[0].registrant.id, status: "declined", declineReason: "Others", reason: "Moving abroad" },
    ])
    expect(result.success).toBe(true)

    const req = await db.smallGroupMemberRequest.findFirst()
    expect(req?.declineReason).toBe("Others")
    expect(req?.notes).toBe("Moving abroad")
  })

  it("asks for a group name only when someone is confirmed", async () => {
    const s = await seed({ ledGroups: [], extraAttendees: 1 })

    const result = await submitCatchMechConfirmations(s.session.token, [
      declineOf(s.attendees[0].registrant.id),
      { registrantId: s.attendees[1].registrant.id, status: "confirmed" },
    ])
    expect(result).toEqual({ success: true, requiresGroupName: true })
    // Nothing is written until the group exists.
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("records declines against the new group once the Timothy names it", async () => {
    const s = await seed({ ledGroups: [], extraAttendees: 1 })
    const decisions: ConfirmDecision[] = [
      declineOf(s.attendees[0].registrant.id),
      { registrantId: s.attendees[1].registrant.id, status: "confirmed" },
    ]

    const result = await createSmallGroupForTimothy(s.session.token, "Ortigas Cell", decisions)
    expect(result.success).toBe(true)

    const group = await db.smallGroup.findFirst({ where: { name: "Ortigas Cell" } })
    expect(group).not.toBeNull()

    const rejected = await db.smallGroupMemberRequest.findFirst({ where: { status: "Rejected" } })
    expect(rejected?.smallGroupId).toBe(group!.id)

    const confirmed = await db.smallGroupMemberRequest.findFirst({ where: { status: "Confirmed" } })
    expect(confirmed?.smallGroupId).toBe(group!.id)
  })

  it("does not duplicate a groupless decline when the faci resubmits", async () => {
    const s = await seed({ ledGroups: [] })
    await submitCatchMechConfirmations(s.session.token, [declineOf(s.attendees[0].registrant.id)])
    await submitCatchMechConfirmations(s.session.token, [declineOf(s.attendees[0].registrant.id)])

    expect(await db.smallGroupMemberRequest.count()).toBe(1)
  })

  it("surfaces a groupless decline on the admin Rejected list", async () => {
    // The admin lists scope by breakoutGroupId, never through smallGroup — a
    // groupless decline must still carry the breakout so it stays visible there.
    const s = await seed({ ledGroups: [] })
    await submitCatchMechConfirmations(s.session.token, [declineOf(s.attendees[0].registrant.id)])

    const rejected = SLUG_CONFIG.rejected
    const rows = await db.smallGroupMemberRequest.findMany({
      where: {
        status: rejected.prismaStatus,
        breakoutGroupId: { in: [s.breakout.id] },
        ...(rejected.declineReasonWhere ?? {}),
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].smallGroupId).toBeNull()
  })

  it("scopes a groupless decline to its author, not to every Timothy", async () => {
    const s = await seed({ ledGroups: [] })

    // A co-faci who also leads no group shares the breakout and its attendees.
    const coMember = await db.member.create({
      data: { firstName: "Co", lastName: "Faci", dateJoined: new Date(), language: [] },
    })
    const coVol = await db.volunteer.create({
      data: {
        memberId: coMember.id,
        eventId: s.event.id,
        committeeId: (await db.volunteerCommittee.findFirstOrThrow()).id,
        preferredRoleId: (await db.committeeRole.findFirstOrThrow()).id,
        status: "Confirmed",
      },
    })
    await db.breakoutGroup.update({
      where: { id: s.breakout.id },
      data: { coFacilitatorId: coVol.id },
    })
    const coSession = await db.catchMechSession.create({
      data: {
        eventId: s.event.id,
        breakoutGroupId: s.breakout.id,
        facilitatorVolunteerId: coVol.id,
      },
    })

    await submitCatchMechConfirmations(s.session.token, [declineOf(s.attendees[0].registrant.id)])

    // The lead's decline clears their own list but leaves the co-faci's untouched.
    expect((await getSessionData(s.session.token))?.rows).toHaveLength(0)
    expect((await getSessionData(coSession.token))?.rows).toHaveLength(1)
  })
})
