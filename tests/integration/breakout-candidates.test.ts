/**
 * The breakout-group candidate picker: the shared unassigned-candidate pool,
 * `listBreakoutCandidates`, and the bulk `addRegistrantsToBreakout` action.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
import {
  listBreakoutCandidates,
  assignRegistrantToBreakout,
  getBreakoutGroupDetails,
  findBreakoutGroupMatches,
} from "@/app/(dashboard)/events/matching-actions"
import { addRegistrantsToBreakout } from "@/app/(dashboard)/events/breakout-actions"
import { MAX_BREAKOUT_BATCH } from "@/lib/breakouts/candidate-filters"

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
    data: {
      firstName: "Ana",
      lastName: "Cruz",
      dateJoined: new Date(),
      language: [],
      ...data,
    },
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

/** A volunteer (Confirmed unless told otherwise), optionally facilitating a group. */
async function seedVolunteer(
  eventId: string,
  memberId: string,
  opts: { facilitates?: string; coFacilitates?: string; status?: "Pending" | "Confirmed" | "Rejected" } = {}
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
      status: opts.status ?? "Confirmed",
    },
  })
  if (opts.facilitates) {
    await db.breakoutGroup.update({
      where: { id: opts.facilitates },
      data: { facilitatorId: volunteer.id },
    })
  }
  if (opts.coFacilitates) {
    await db.breakoutGroup.update({
      where: { id: opts.coFacilitates },
      data: { coFacilitatorId: volunteer.id },
    })
  }
  return volunteer
}

function asStaff(overrides: Record<string, unknown> = {}) {
  vi.mocked(auth).mockResolvedValueOnce({
    user: {
      id: "staff",
      name: "Staff",
      email: "staff@example.com",
      username: "staff",
      role: "Staff",
      permissions: [],
      eventAccess: [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
      ...overrides,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

// ─── The shared candidate pool ───────────────────────────────────────────────

describe("unassignedCandidateWhere", () => {
  it("excludes registrants already in a breakout group", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const assigned = await seedRegistrant(event.id, { firstName: "In", lastName: "Group" })
    const free = await seedRegistrant(event.id, { firstName: "Not", lastName: "Group" })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: assigned.id },
    })

    const rows = await db.eventRegistrant.findMany({
      where: { eventId: event.id, ...unassignedCandidateWhere({ eventId: event.id }) },
      select: { id: true },
    })
    expect(rows.map((r) => r.id)).toEqual([free.id])
  })

  it("excludes facilitators and co-facilitators", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const faci = await seedMember({ firstName: "Faci" })
    const coFaci = await seedMember({ firstName: "Co" })
    await seedVolunteer(event.id, faci.id, { facilitates: group.id })
    await seedVolunteer(event.id, coFaci.id, { coFacilitates: group.id })
    await seedRegistrant(event.id, { memberId: faci.id })
    await seedRegistrant(event.id, { memberId: coFaci.id })
    const participant = await seedRegistrant(event.id, { firstName: "Plain", lastName: "Person" })

    const rows = await db.eventRegistrant.findMany({
      where: { eventId: event.id, ...unassignedCandidateWhere({ eventId: event.id }) },
      select: { id: true },
    })
    expect(rows.map((r) => r.id)).toEqual([participant.id])
  })

  // Pins the step-0 decision: the list page used to exclude EVERY confirmed
  // volunteer, so its "N unassigned" count disagreed with what you could pick.
  it("keeps confirmed volunteers who are not facilitating a table", async () => {
    const event = await seedEvent()
    await seedGroup(event.id)
    const helper = await seedMember({ firstName: "Helper" })
    await seedVolunteer(event.id, helper.id)
    const registrant = await seedRegistrant(event.id, { memberId: helper.id })

    const rows = await db.eventRegistrant.findMany({
      where: { eventId: event.id, ...unassignedCandidateWhere({ eventId: event.id }) },
      select: { id: true },
    })
    expect(rows.map((r) => r.id)).toEqual([registrant.id])
  })

  it("does not exclude a facilitator of a different event", async () => {
    const eventA = await seedEvent("A")
    const eventB = await seedEvent("B")
    const groupB = await seedGroup(eventB.id)
    const person = await seedMember({ firstName: "Busy" })
    await seedVolunteer(eventB.id, person.id, { facilitates: groupB.id })
    const registrantA = await seedRegistrant(eventA.id, { memberId: person.id })

    const rows = await db.eventRegistrant.findMany({
      where: { eventId: eventA.id, ...unassignedCandidateWhere({ eventId: eventA.id }) },
      select: { id: true },
    })
    expect(rows.map((r) => r.id)).toEqual([registrantA.id])
  })
})

// ─── listBreakoutCandidates ──────────────────────────────────────────────────

describe("listBreakoutCandidates", () => {
  it("returns the unassigned pool with a fit score for each candidate", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { genderFocus: "Female" })
    const member = await seedMember({ gender: "Female", language: ["Tagalog"] })
    await seedRegistrant(event.id, { memberId: member.id })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.candidates).toHaveLength(1)
    const [c] = result.data.candidates
    expect(c.name).toBe("Ana Cruz")
    expect(c.isMember).toBe(true)
    expect(c.demographics.gender).toBe("Female")
    expect(c.demographics.language).toEqual(["Tagalog"])
    expect(c.passesGates).toBe(true)
    expect(c.score).toBeGreaterThan(0)
  })

  // The key behavioral difference from matchBreakoutGroups, which filters gate
  // failures out entirely. The picker must still offer them for an override.
  it("includes candidates who fail the group's gates, flagged", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { genderFocus: "Female" })
    const male = await seedMember({ firstName: "Ben", gender: "Male" })
    await seedRegistrant(event.id, { memberId: male.id })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.candidates).toHaveLength(1)
    expect(result.data.candidates[0].passesGates).toBe(false)
  })

  it("resolves member, guest and anonymous registrants", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const member = await seedMember({ gender: "Female" })
    const guest = await seedGuest({ gender: "Male" })
    await seedRegistrant(event.id, { memberId: member.id })
    await seedRegistrant(event.id, { guestId: guest.id })
    await seedRegistrant(event.id, { firstName: "Walk", lastName: "In" })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    const byName = new Map(result.data.candidates.map((c) => [c.name, c]))
    expect(byName.get("Ana Cruz")?.isMember).toBe(true)
    expect(byName.get("Ana Cruz")?.demographics.gender).toBe("Female")
    expect(byName.get("Ben Lim")?.isMember).toBe(false)
    expect(byName.get("Ben Lim")?.demographics.gender).toBe("Male")
    expect(byName.get("Walk In")?.isAnonymous).toBe(true)
    expect(byName.get("Walk In")?.demographics.gender).toBeNull()
  })

  it("returns each candidate's bucket, and the bucket bounds the age filter needs", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const bucket = await db.ageRangeBucket.create({
      data: { label: "26 – 35", minAge: 26, maxAge: 35, order: 1 },
    })
    const member = await seedMember({ ageRangeBucketId: bucket.id })
    await seedRegistrant(event.id, { memberId: member.id })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.candidates[0].demographics.ageRangeBucket).toEqual({
      id: bucket.id,
      label: "26 – 35",
      minAge: 26,
      maxAge: 35,
    })
    // Bounds included: picking a bucket in the UI sets the age window from them.
    expect(result.data.ageRangeBuckets).toEqual([
      { id: bucket.id, label: "26 – 35", minAge: 26, maxAge: 35 },
    ])
  })

  it("normalizes a guest's single inline schedule slot", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const guest = await seedGuest({
      scheduleDayOfWeek: 3,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })
    await seedRegistrant(event.id, { guestId: guest.id })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.candidates[0].demographics.scheduleSlots).toEqual([
      { dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" },
    ])
  })

  describe("isVolunteer", () => {
    it("flags a registrant whose member is serving at this event", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      const member = await seedMember({ firstName: "Serving" })
      await seedVolunteer(event.id, member.id)
      await seedRegistrant(event.id, { memberId: member.id })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.candidates[0].isVolunteer).toBe(true)
    })

    it("leaves an ordinary participant unflagged", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      const member = await seedMember({ firstName: "Plain" })
      await seedRegistrant(event.id, { memberId: member.id })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.candidates[0].isVolunteer).toBe(false)
    })

    // Volunteer hangs off Member, so a guest can never be one.
    it("leaves a guest unflagged", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      const guest = await seedGuest()
      await seedRegistrant(event.id, { guestId: guest.id })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.candidates[0].isVolunteer).toBe(false)
    })

    it("counts a Pending sign-up but not a Rejected one", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      const pending = await seedMember({ firstName: "Pending" })
      const rejected = await seedMember({ firstName: "Rejected" })
      await seedVolunteer(event.id, pending.id, { status: "Pending" })
      await seedVolunteer(event.id, rejected.id, { status: "Rejected" })
      await seedRegistrant(event.id, { memberId: pending.id })
      await seedRegistrant(event.id, { memberId: rejected.id })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result.success).toBe(true)
      if (!result.success) return

      const byName = new Map(result.data.candidates.map((c) => [c.name, c.isVolunteer]))
      expect(byName.get("Pending Cruz")).toBe(true)
      expect(byName.get("Rejected Cruz")).toBe(false)
    })

    // Scoped to the event being seated: serving elsewhere says nothing here.
    it("ignores a volunteer record on another event", async () => {
      const event = await seedEvent()
      const other = await seedEvent("Other")
      const group = await seedGroup(event.id)
      const member = await seedMember({ firstName: "Elsewhere" })
      await seedVolunteer(other.id, member.id)
      await seedRegistrant(event.id, { memberId: member.id })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.candidates[0].isVolunteer).toBe(false)
    })
  })

  it("merges the form config across all three contexts", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    // Register never asks for gender; walk-in does. The surface someone used
    // isn't recorded, so the union is what the event effectively collects.
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldGender: false },
    })
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "WalkIn", fieldGender: true },
    })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.formConfig.fieldGender).toBe(true)
  })

  it("reports capacity", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { memberLimit: 5 })
    const seated = await seedRegistrant(event.id, { firstName: "Seated", lastName: "One" })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: seated.id },
    })

    const result = await listBreakoutCandidates(group.id, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.memberLimit).toBe(5)
    expect(result.data.currentCount).toBe(1)
  })

  describe("authorization", () => {
    it("rejects a group id belonging to another event", async () => {
      const eventA = await seedEvent("A")
      const eventB = await seedEvent("B")
      const groupB = await seedGroup(eventB.id)

      const result = await listBreakoutCandidates(groupB.id, { eventId: eventA.id })
      expect(result.success).toBe(false)
    })

    it("rejects a user without Events read access", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      asStaff()

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result).toEqual({ success: false, error: "Unauthorized." })
    })

    it("rejects a user scoped to a different event", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      asStaff({
        permissions: [{ feature: "Events", actions: ["Read"] }],
        eventAccess: ["some-other-event"],
      })

      const result = await listBreakoutCandidates(group.id, { eventId: event.id })
      expect(result).toEqual({ success: false, error: "Unauthorized." })
    })
  })
})

// ─── addRegistrantsToBreakout ────────────────────────────────────────────────

describe("addRegistrantsToBreakout", () => {
  it("adds every requested registrant", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const a = await seedRegistrant(event.id, { firstName: "A", lastName: "One" })
    const b = await seedRegistrant(event.id, { firstName: "B", lastName: "Two" })

    const result = await addRegistrantsToBreakout(group.id, [a.id, b.id], { eventId: event.id })
    expect(result).toEqual({ success: true, data: { added: 2, failed: [] } })
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(2)
  })

  it("returns partial results when the batch hits the member limit", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { memberLimit: 2 })
    const ids: string[] = []
    for (const n of ["A", "B", "C", "D"]) {
      const r = await seedRegistrant(event.id, { firstName: n, lastName: "X" })
      ids.push(r.id)
    }

    const result = await addRegistrantsToBreakout(group.id, ids, { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.added).toBe(2)
    expect(result.data.failed).toHaveLength(2)
    expect(result.data.failed[0].reason).toMatch(/member limit/)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(2)
  })

  // CCF-87: one bad id must not abort the rest of the batch.
  it("skips a facilitator with a reason and keeps going", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const faci = await seedMember({ firstName: "Faci" })
    await seedVolunteer(event.id, faci.id, { facilitates: group.id })
    const faciReg = await seedRegistrant(event.id, { memberId: faci.id })
    const ok = await seedRegistrant(event.id, { firstName: "Fine", lastName: "Person" })

    const result = await addRegistrantsToBreakout(group.id, [faciReg.id, ok.id], { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.added).toBe(1)
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].reason).toMatch(/facilitator/)
    const members = await db.breakoutGroupMember.findMany({
      where: { breakoutGroupId: group.id },
      select: { registrantId: true },
    })
    expect(members.map((m) => m.registrantId)).toEqual([ok.id])
  })

  it("skips someone already in another breakout group", async () => {
    const event = await seedEvent()
    const groupA = await seedGroup(event.id, { name: "A" })
    const groupB = await seedGroup(event.id, { name: "B" })
    const r = await seedRegistrant(event.id, { firstName: "Taken", lastName: "One" })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: groupA.id, registrantId: r.id },
    })

    const result = await addRegistrantsToBreakout(groupB.id, [r.id], { eventId: event.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.added).toBe(0)
    expect(result.data.failed[0].reason).toMatch(/already in a breakout group/)
  })

  it("skips a registrant belonging to a different event", async () => {
    const eventA = await seedEvent("A")
    const eventB = await seedEvent("B")
    const groupA = await seedGroup(eventA.id)
    const foreign = await seedRegistrant(eventB.id, { firstName: "Other", lastName: "Event" })

    const result = await addRegistrantsToBreakout(groupA.id, [foreign.id], { eventId: eventA.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.added).toBe(0)
    expect(result.data.failed[0].reason).toMatch(/not a registrant of this event/)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("adds a duplicated id only once", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const r = await seedRegistrant(event.id, { firstName: "Dupe", lastName: "One" })

    const result = await addRegistrantsToBreakout(group.id, [r.id, r.id, r.id], { eventId: event.id })
    expect(result).toEqual({ success: true, data: { added: 1, failed: [] } })
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(1)
  })

  it("handles an empty list without touching the database", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)

    const result = await addRegistrantsToBreakout(group.id, [], { eventId: event.id })
    expect(result).toEqual({ success: true, data: { added: 0, failed: [] } })
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("creates a small group request per success when the group is linked", async () => {
    const event = await seedEvent()
    const leader = await seedMember({ firstName: "Leader" })
    const smallGroup = await db.smallGroup.create({
      data: { name: "DGroup", leaderId: leader.id, language: [] },
    })
    const group = await seedGroup(event.id, { linkedSmallGroupId: smallGroup.id })
    const guestA = await seedGuest({ firstName: "GA" })
    const guestB = await seedGuest({ firstName: "GB" })
    const a = await seedRegistrant(event.id, { guestId: guestA.id })
    const b = await seedRegistrant(event.id, { guestId: guestB.id })

    const result = await addRegistrantsToBreakout(group.id, [a.id, b.id], { eventId: event.id })
    expect(result.success).toBe(true)
    expect(
      await db.smallGroupMemberRequest.count({ where: { smallGroupId: smallGroup.id } })
    ).toBe(2)
  })

  it("revalidates the breakouts, group and registrants paths", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const r = await seedRegistrant(event.id, { firstName: "A", lastName: "One" })

    await addRegistrantsToBreakout(group.id, [r.id], { eventId: event.id })

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0])
    expect(paths).toContain(`/event/${event.id}/breakouts`)
    expect(paths).toContain(`/event/${event.id}/breakouts/${group.id}`)
    expect(paths).toContain(`/event/${event.id}/registrants`)
  })

  // The capacity read and the writes share a transaction. Without one, two
  // admins adding at the same time both see room and the group overshoots its
  // limit — batching made that window wide enough to hit in practice.
  it("does not exceed memberLimit when two batches race", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { memberLimit: 3 })
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = await seedRegistrant(event.id, { firstName: `P${i}`, lastName: "X" })
      ids.push(r.id)
    }

    const [a, b] = await Promise.all([
      addRegistrantsToBreakout(group.id, ids.slice(0, 3), { eventId: event.id }),
      addRegistrantsToBreakout(group.id, ids.slice(3), { eventId: event.id }),
    ])

    expect(a.success && b.success).toBe(true)
    const seated = await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })
    expect(seated).toBe(3)
    if (a.success && b.success) {
      expect(a.data.added + b.data.added).toBe(3)
    }
  })

  it("rejects a batch larger than the cap", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const ids = Array.from({ length: MAX_BREAKOUT_BATCH + 1 }, (_, i) => `id-${i}`)

    const result = await addRegistrantsToBreakout(group.id, ids, { eventId: event.id })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/more than 500/)
  })

  describe("authorization", () => {
    it("rejects a user without Events write permission", async () => {
      const event = await seedEvent()
      const group = await seedGroup(event.id)
      const r = await seedRegistrant(event.id, { firstName: "A", lastName: "One" })
      asStaff({ permissions: [{ feature: "Events", actions: ["Read"] }] })

      const result = await addRegistrantsToBreakout(group.id, [r.id], { eventId: event.id })
      expect(result).toEqual({ success: false, error: "Unauthorized." })
      expect(await db.breakoutGroupMember.count()).toBe(0)
    })

    it("rejects a group id belonging to another event", async () => {
      const eventA = await seedEvent("A")
      const eventB = await seedEvent("B")
      const groupB = await seedGroup(eventB.id)
      const r = await seedRegistrant(eventA.id, { firstName: "A", lastName: "One" })

      const result = await addRegistrantsToBreakout(groupB.id, [r.id], { eventId: eventA.id })
      expect(result).toEqual({ success: false, error: "Breakout group not found" })
      expect(await db.breakoutGroupMember.count()).toBe(0)
    })
  })
})

// ─── assignRegistrantToBreakout (single-placement entry point) ───────────────

/**
 * This action used to be its own copy of the placement logic that checked only
 * capacity. It now delegates to `addRegistrantsToBreakout`, so it inherits auth,
 * event scoping and the CCF-87 facilitator guard. Each case below is a hole that
 * was reachable from the registrant detail page's assign button.
 */
describe("assignRegistrantToBreakout", () => {
  it("refuses to place a registrant into another event's breakout group", async () => {
    const eventA = await seedEvent("A")
    const eventB = await seedEvent("B")
    const groupB = await seedGroup(eventB.id)
    const regA = await seedRegistrant(eventA.id, { firstName: "Cross", lastName: "Event" })

    const result = await assignRegistrantToBreakout(groupB.id, regA.id, { eventId: eventA.id })

    expect(result.success).toBe(false)
    // Nothing written: a cross-event membership would also have hidden this
    // person from their own event's candidate pool, which filters on
    // `breakoutGroupMemberships: { none: {} }` without an event scope.
    expect(await db.breakoutGroupMember.count()).toBe(0)
    const stillAvailable = await db.eventRegistrant.findMany({
      where: { eventId: eventA.id, ...unassignedCandidateWhere({ eventId: eventA.id }) },
      select: { id: true },
    })
    expect(stillAvailable.map((r) => r.id)).toEqual([regA.id])
  })

  it("refuses to seat a facilitator at their own table (CCF-87)", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const faci = await seedMember({ firstName: "Faci" })
    await seedVolunteer(event.id, faci.id, { facilitates: group.id })
    const reg = await seedRegistrant(event.id, { memberId: faci.id })

    const result = await assignRegistrantToBreakout(group.id, reg.id, { eventId: event.id })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/facilitator/)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("refuses to move someone already in another breakout group", async () => {
    const event = await seedEvent()
    const groupA = await seedGroup(event.id, { name: "A" })
    const groupB = await seedGroup(event.id, { name: "B" })
    const reg = await seedRegistrant(event.id, { firstName: "Taken", lastName: "One" })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: groupA.id, registrantId: reg.id },
    })

    const result = await assignRegistrantToBreakout(groupB.id, reg.id, { eventId: event.id })
    expect(result.success).toBe(false)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: groupB.id } })).toBe(0)
  })

  it("requires an authenticated writer", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const reg = await seedRegistrant(event.id, { firstName: "A", lastName: "One" })
    asStaff({ permissions: [{ feature: "Events", actions: ["Read"] }] })

    const result = await assignRegistrantToBreakout(group.id, reg.id, { eventId: event.id })
    expect(result).toEqual({ success: false, error: "Unauthorized." })
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("still places a legitimate registrant", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    const reg = await seedRegistrant(event.id, { firstName: "Fine", lastName: "Person" })

    const result = await assignRegistrantToBreakout(group.id, reg.id, { eventId: event.id })
    expect(result.success).toBe(true)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(1)
  })

  it("reports capacity refusal with the person's name", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, { memberLimit: 1 })
    const seated = await seedRegistrant(event.id, { firstName: "Seated", lastName: "One" })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: seated.id },
    })
    const late = await seedRegistrant(event.id, { firstName: "Late", lastName: "Comer" })

    const result = await assignRegistrantToBreakout(group.id, late.id, { eventId: event.id })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("Late Comer")
    expect(result.error).toMatch(/member limit/)
  })
})

// ─── Read actions ────────────────────────────────────────────────────────────

describe("read-action authorization", () => {
  it("getBreakoutGroupDetails rejects a user scoped to another event", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id)
    asStaff({
      permissions: [{ feature: "Events", actions: ["Read"] }],
      eventAccess: ["different-event"],
    })

    const result = await getBreakoutGroupDetails(group.id, { eventId: event.id })
    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })

  it("findBreakoutGroupMatches rejects a user without Events access", async () => {
    const event = await seedEvent()
    const reg = await seedRegistrant(event.id, { firstName: "A", lastName: "One" })
    asStaff()

    const result = await findBreakoutGroupMatches(reg.id, { eventId: event.id })
    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })
})
