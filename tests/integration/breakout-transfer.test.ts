/**
 * CCF-139 — `transferRegistrantToBreakout`: the atomic move between breakout
 * groups, its guards, and what happens to the Catch Mech request that a
 * placement raised.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { transferRegistrantToBreakout } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "EventFormConfig", "EventModule", "Event", "SmallGroup", "Member", "Guest", "LifeStage", "AgeRangeBucket", "MatchingWeightConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedEvent(name = "Retreat") {
  return db.event.create({
    data: { name, type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

async function seedGroup(eventId: string, data: Record<string, unknown> = {}) {
  return db.breakoutGroup.create({
    data: { eventId, name: "Table 1", language: [], ...data },
  })
}

async function seedMember(data: Record<string, unknown> = {}) {
  return db.member.create({
    data: { firstName: "Ana", lastName: "Cruz", dateJoined: new Date(), language: [], ...data },
  })
}

async function seedGuest(data: Record<string, unknown> = {}) {
  return db.guest.create({
    data: { firstName: "Ben", lastName: "Lim", language: [], ...data },
  })
}

async function seedRegistrant(eventId: string, data: Record<string, unknown> = {}) {
  return db.eventRegistrant.create({ data: { eventId, ...data } })
}

async function seedVolunteer(
  eventId: string,
  memberId: string,
  opts: { facilitates?: string } = {}
) {
  const committee = await db.volunteerCommittee.create({
    data: { name: `Committee ${memberId}`, eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const volunteer = await db.volunteer.create({
    data: {
      memberId,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  if (opts.facilitates) {
    await db.breakoutGroup.update({
      where: { id: opts.facilitates },
      data: { facilitatorId: volunteer.id },
    })
  }
  return volunteer
}

async function place(breakoutGroupId: string, registrantId: string) {
  return db.breakoutGroupMember.create({ data: { breakoutGroupId, registrantId } })
}

/**
 * The suite default (tests/setup.ts) is a SuperAdmin, which is what these tests
 * want — `mockResolvedValueOnce` so the override doesn't leak into the next test.
 */
function asAnonymous() {
  // `as never`: NextAuth v5's `auth` is overloaded (it doubles as middleware),
  // so TS resolves the mock against the wrong signature. Same cast the rest of
  // the suite uses.
  vi.mocked(auth).mockResolvedValueOnce(null as never)
}

async function groupIdFor(registrantId: string) {
  const row = await db.breakoutGroupMember.findFirst({ where: { registrantId } })
  return row?.breakoutGroupId ?? null
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("transferRegistrantToBreakout", () => {
  it("moves the membership row to the destination group", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(true)
    expect(await groupIdFor(r.id)).toBe(to.id)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: from.id } })).toBe(0)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: to.id } })).toBe(1)
  })

  it("never leaves the registrant in two groups at once", async () => {
    // BreakoutGroupMember has no unique on registrantId alone, so a create-first
    // ordering would double-place with no DB error to catch it.
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(await db.breakoutGroupMember.count({ where: { registrantId: r.id } })).toBe(1)
  })

  it("revalidates both group paths plus the event surfaces", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0])
    expect(paths).toContain(`/event/${event.id}/breakouts`)
    expect(paths).toContain(`/event/${event.id}/breakouts/${from.id}`)
    expect(paths).toContain(`/event/${event.id}/breakouts/${to.id}`)
    expect(paths).toContain(`/event/${event.id}/registrants`)
    expect(paths).toContain(`/event/${event.id}/catch-mech`)
  })
})

// ─── Guards ──────────────────────────────────────────────────────────────────

describe("transferRegistrantToBreakout guards", () => {
  it("rejects a destination that is already at its member limit", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B", memberLimit: 1 })
    const sitting = await seedRegistrant(event.id, { firstName: "Sat", lastName: "Down" })
    await place(to.id, sitting.id)
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(false)
    // The whole point of the transaction: a rejected move leaves them put.
    expect(await groupIdFor(r.id)).toBe(from.id)
  })

  it("allows a transfer into a group with room under its limit", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B", memberLimit: 2 })
    const sitting = await seedRegistrant(event.id, { firstName: "Sat", lastName: "Down" })
    await place(to.id, sitting.id)
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(true)
    expect(await groupIdFor(r.id)).toBe(to.id)
  })

  it("rejects a transfer to the same group", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, from.id, r.id, event.id)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/different breakout group/i)
    expect(await groupIdFor(r.id)).toBe(from.id)
  })

  it("rejects when the registrant is not in the source group", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Loose", lastName: "One" })

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/no longer a member/i)
    expect(await db.breakoutGroupMember.count({ where: { registrantId: r.id } })).toBe(0)
  })

  it("rejects a registrant belonging to another event", async () => {
    const event = await seedEvent("Retreat")
    const other = await seedEvent("Other")
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const foreign = await seedRegistrant(other.id, { firstName: "Else", lastName: "Where" })

    const result = await transferRegistrantToBreakout(from.id, to.id, foreign.id, event.id)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/not a registrant of this event/i)
  })

  it("rejects a destination group belonging to another event", async () => {
    const event = await seedEvent("Retreat")
    const other = await seedEvent("Other")
    const from = await seedGroup(event.id, { name: "A" })
    const foreign = await seedGroup(other.id, { name: "Foreign" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, foreign.id, r.id, event.id)

    expect(result.success).toBe(false)
    expect(await groupIdFor(r.id)).toBe(from.id)
  })

  it("rejects someone appointed facilitator since they were placed (CCF-87)", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const member = await seedMember()
    const r = await seedRegistrant(event.id, { memberId: member.id })
    await place(from.id, r.id)
    // Promoted after the placement — the guard has to be re-checked, not assumed.
    await seedVolunteer(event.id, member.id, { facilitates: to.id })

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/facilitator/i)
    expect(await groupIdFor(r.id)).toBe(from.id)
  })

  it("refuses an unauthenticated caller", async () => {
    asAnonymous()
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Mover", lastName: "One" })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(false)
    expect(await groupIdFor(r.id)).toBe(from.id)
  })
})

// ─── Catch Mech linkage ──────────────────────────────────────────────────────

describe("transferRegistrantToBreakout and the Catch Mech request", () => {
  async function seedLinkedGroups(eventId: string, smallGroupIds: [string, string]) {
    const from = await seedGroup(eventId, {
      name: "A",
      linkedSmallGroupId: smallGroupIds[0],
    })
    const to = await seedGroup(eventId, { name: "B", linkedSmallGroupId: smallGroupIds[1] })
    return { from, to }
  }

  async function seedSmallGroup(name: string) {
    const leader = await seedMember({ firstName: "Lead", lastName: name })
    return db.smallGroup.create({ data: { name, leaderId: leader.id, language: [] } })
  }

  it("re-points a pending request when both groups feed the same DGroup", async () => {
    const event = await seedEvent()
    const sg = await seedSmallGroup("Alpha")
    const { from, to } = await seedLinkedGroups(event.id, [sg.id, sg.id])
    const guest = await seedGuest()
    const r = await seedRegistrant(event.id, { guestId: guest.id })
    await place(from.id, r.id)
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: sg.id, guestId: guest.id, breakoutGroupId: from.id },
    })

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)
    expect(result.success).toBe(true)

    const after = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
    // Still the same request: same row, same createdAt, still awaiting the leader.
    expect(after?.status).toBe("Pending")
    expect(after?.breakoutGroupId).toBe(to.id)
    expect(after?.createdAt.getTime()).toBe(request.createdAt.getTime())
    expect(await db.smallGroupMemberRequest.count()).toBe(1)
  })

  it("raises no bogus rejection log on a same-DGroup transfer", async () => {
    const event = await seedEvent()
    const sg = await seedSmallGroup("Alpha")
    const { from, to } = await seedLinkedGroups(event.id, [sg.id, sg.id])
    const guest = await seedGuest()
    const r = await seedRegistrant(event.id, { guestId: guest.id })
    await place(from.id, r.id)
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: sg.id, guestId: guest.id, breakoutGroupId: from.id },
    })

    await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(
      await db.smallGroupLog.count({ where: { action: "TempAssignmentRejected" } })
    ).toBe(0)
  })

  it("cancels and re-raises when the destination feeds a different DGroup", async () => {
    const event = await seedEvent()
    const alpha = await seedSmallGroup("Alpha")
    const beta = await seedSmallGroup("Beta")
    const { from, to } = await seedLinkedGroups(event.id, [alpha.id, beta.id])
    const guest = await seedGuest()
    const r = await seedRegistrant(event.id, { guestId: guest.id })
    await place(from.id, r.id)
    const original = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: alpha.id, guestId: guest.id, breakoutGroupId: from.id },
    })

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)
    expect(result.success).toBe(true)

    const old = await db.smallGroupMemberRequest.findUnique({ where: { id: original.id } })
    expect(old?.status).toBe("Rejected")
    expect(old?.resolvedAt).not.toBeNull()

    const raised = await db.smallGroupMemberRequest.findFirst({
      where: { smallGroupId: beta.id, guestId: guest.id, status: "Pending" },
    })
    expect(raised?.breakoutGroupId).toBe(to.id)
  })

  it("still moves the registrant when there is no Catch Mech request to carry", async () => {
    const event = await seedEvent()
    const from = await seedGroup(event.id, { name: "A" })
    const to = await seedGroup(event.id, { name: "B" })
    const guest = await seedGuest()
    const r = await seedRegistrant(event.id, { guestId: guest.id })
    await place(from.id, r.id)

    const result = await transferRegistrantToBreakout(from.id, to.id, r.id, event.id)

    expect(result.success).toBe(true)
    expect(await groupIdFor(r.id)).toBe(to.id)
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })
})
