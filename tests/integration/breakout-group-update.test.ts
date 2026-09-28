/**
 * `updateBreakoutGroup` — what a save from either edit drawer is allowed to
 * touch.
 *
 * The drawers submit only the fields they render, and neither renders a
 * co-facilitator control (that slot is assigned from the detail page). The
 * action used to coerce every absent key to null, so saving a rename detached
 * the co-facilitator.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: undefined,
      name: "Test Admin",
      email: "test@example.com",
      username: "test-admin",
      role: "SuperAdmin",
      permissions: [],
      eventAccess: [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
    },
  }),
}))

import { db } from "@/lib/db"
import { setFacilitator, updateBreakoutGroup } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const event = await db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })

  // Both lead a DGroup: a facilitator who leads none is a Timothy, and the
  // action then demands a hand-entered profile — a different rule from the one
  // under test here.
  async function volunteer(firstName: string) {
    const member = await db.member.create({
      data: { firstName, lastName: "T", dateJoined: new Date(), language: [] },
    })
    const ledGroup = await db.smallGroup.create({
      data: { name: `${firstName}'s Group`, leaderId: member.id },
    })
    const vol = await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })
    return { member, vol, ledGroup }
  }

  const faci = await volunteer("Rachel")
  const coFaci = await volunteer("Mika")
  const group = await db.breakoutGroup.create({
    data: {
      eventId: event.id,
      name: "Breakout A",
      language: [],
      facilitatorId: faci.vol.id,
      coFacilitatorId: coFaci.vol.id,
    },
  })
  return { event, group, faci, coFaci }
}

/** Exactly what the edit drawers send: no `coFacilitatorId` key at all. */
function drawerPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Breakout A",
    facilitatorId: null as string | null,
    memberLimit: null,
    linkedSmallGroupId: null,
    lifeStageIds: [] as string[],
    genderFocus: null,
    language: [] as string[],
    ageRangeMin: null,
    ageRangeMax: null,
    ...overrides,
  }
}

// ─── Regression: the co-facilitator survives a drawer save ────────────────────

describe("updateBreakoutGroup and the co-facilitator slot", () => {
  it("keeps the co-facilitator when the payload omits it", async () => {
    const { event, group, faci, coFaci } = await seed()

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ name: "Breakout A (renamed)", facilitatorId: faci.vol.id })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.name).toBe("Breakout A (renamed)")
    expect(updated?.facilitatorId).toBe(faci.vol.id)
    expect(updated?.coFacilitatorId).toBe(coFaci.vol.id)
  })

  it("keeps manualAssignOnly when the payload omits it", async () => {
    // Same rule as the two slots above, and the reason the schema declares the
    // field `.optional()` rather than `.default(false)`: a caller that never
    // rendered the checkbox must not be read as switching it off.
    const { event, group, faci } = await seed()
    await db.breakoutGroup.update({
      where: { id: group.id },
      data: { manualAssignOnly: true },
    })
    const payload = drawerPayload({ facilitatorId: faci.vol.id })
    delete (payload as Record<string, unknown>).manualAssignOnly

    const result = await updateBreakoutGroup(group.id, { eventId: event.id }, payload)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.manualAssignOnly).toBe(true)
  })

  it("round-trips manualAssignOnly in both directions", async () => {
    const { event, group, faci } = await seed()

    const on = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: faci.vol.id, manualAssignOnly: true })
    )
    expect(on.success).toBe(true)
    expect(
      (await db.breakoutGroup.findUnique({ where: { id: group.id } }))?.manualAssignOnly
    ).toBe(true)

    const off = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: faci.vol.id, manualAssignOnly: false })
    )
    expect(off.success).toBe(true)
    expect(
      (await db.breakoutGroup.findUnique({ where: { id: group.id } }))?.manualAssignOnly
    ).toBe(false)
  })

  it("keeps manualAssignOnly and criteria when removing the facilitator", async () => {
    const { event, group, faci } = await seed()
    await db.breakoutGroup.update({
      where: { id: group.id },
      data: { manualAssignOnly: true, genderFocus: "Male", ageRangeMin: 20 },
    })
    // Re-point the group at a single facilitator first, so the clear below is
    // the transition the action watches for.
    await db.breakoutGroup.update({
      where: { id: group.id },
      data: { coFacilitatorId: null, facilitatorId: faci.vol.id },
    })

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: null, manualAssignOnly: true, genderFocus: "Male", ageRangeMin: 20 })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.facilitatorId).toBeNull()
    expect(updated?.genderFocus).toBe("Male")
    expect(updated?.manualAssignOnly).toBe(true) // …but this is not profile
  })

  it("keeps the facilitator when the payload omits it", async () => {
    const { event, group, faci } = await seed()
    const payload = drawerPayload()
    delete (payload as Record<string, unknown>).facilitatorId

    const result = await updateBreakoutGroup(group.id, { eventId: event.id }, payload)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.facilitatorId).toBe(faci.vol.id)
  })

  it("still clears a slot when null is submitted explicitly", async () => {
    const { event, group, faci } = await seed()

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: faci.vol.id, coFacilitatorId: null })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.coFacilitatorId).toBeNull()
  })

  it("rejects a facilitator who is already the stored co-facilitator", async () => {
    const { event, group, coFaci } = await seed()

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: coFaci.vol.id })
    )

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/different/i)
    const unchanged = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(unchanged?.coFacilitatorId).toBe(coFaci.vol.id)
  })
})

// ─── The matching profile the drawer submits ──────────────────────────────────

describe("updateBreakoutGroup and the matching profile", () => {
  // The profile is the group's own and always editable. It used to be a
  // read-only copy of the facilitator's DGroup, so a facilitator who led one had
  // no way to hand-edit these at all.
  it("persists a hand-edited profile for a facilitator who leads a DGroup", async () => {
    const { event, group, faci } = await seed()
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 0 } })

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({
        facilitatorId: faci.vol.id,
        lifeStageIds: [lifeStage.id],
        genderFocus: "Female",
        language: ["English"],
        ageRangeMin: 25,
        ageRangeMax: 35,
      })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({
      where: { id: group.id },
      include: { lifeStages: true },
    })
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["English"])
    expect(updated?.ageRangeMin).toBe(25)
    expect(updated?.ageRangeMax).toBe(35)
    expect(updated?.lifeStages.map((ls) => ls.id)).toEqual([lifeStage.id])
  })

  it("clears criteria the drawer submits as empty", async () => {
    const { event, group, faci } = await seed()
    await db.breakoutGroup.update({
      where: { id: group.id },
      data: { genderFocus: "Female", language: ["English"], ageRangeMin: 25 },
    })

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({ facilitatorId: faci.vol.id })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.genderFocus).toBeNull()
    expect(updated?.language).toEqual([])
    expect(updated?.ageRangeMin).toBeNull()
  })

  // Meeting format, location city and schedule are DGroup concerns that were
  // carried over and never meant anything for a table meeting once, during the
  // event at the venue. The columns survive; nothing writes them.
  it("ignores meeting format, city and schedule if a stale caller sends them", async () => {
    const { event, group, faci } = await seed()

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({
        facilitatorId: faci.vol.id,
        meetingFormat: "InPerson",
        locationCity: "Pasig",
        schedule: { dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" },
      })
    )

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({
      where: { id: group.id },
      include: { schedules: true },
    })
    expect(updated?.meetingFormat).toBeNull()
    expect(updated?.locationCity).toBeNull()
    expect(updated?.schedules).toHaveLength(0)
  })
})

// ─── Facilitator changes preserve criteria ───────────────────────────────────

/**
 * Criteria belong to the breakout group. A legacy Catch Mech link belongs to
 * the lead facilitator and is cleared when that lead changes.
 */
describe("facilitator changes preserve the matching profile", () => {
  /** Gives the seeded group a full profile and a Catch Mech target. */
  async function withProfile(groupId: string, linkedSmallGroupId: string) {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 0 } })
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: {
        linkedSmallGroupId,
        lifeStages: { connect: { id: lifeStage.id } },
        genderFocus: "Female",
        language: ["English"],
        ageRangeMin: 25,
        ageRangeMax: 35,
      },
    })
    return lifeStage
  }

  function readGroup(groupId: string) {
    return db.breakoutGroup.findUnique({
      where: { id: groupId },
      include: { lifeStages: true },
    })
  }

  it("preserves every factor via setFacilitator", async () => {
    const { event, group, faci } = await seed()
    await withProfile(group.id, faci.ledGroup.id)

    const result = await setFacilitator(group.id, null, "facilitator", { eventId: event.id })

    expect(result.success).toBe(true)
    const updated = await readGroup(group.id)
    expect(updated?.facilitatorId).toBeNull()
    expect(updated?.linkedSmallGroupId).toBeNull()
    expect(updated?.lifeStages).toHaveLength(1)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["English"])
    expect(updated?.ageRangeMin).toBe(25)
    expect(updated?.ageRangeMax).toBe(35)
  })

  // Regression: this is exactly what 444912e protected — a facilitator change
  // must not silently rewrite what the group matches for.
  it("leaves the profile alone when one facilitator replaces another", async () => {
    const { event, group, faci, coFaci } = await seed()
    const lifeStage = await withProfile(group.id, faci.ledGroup.id)
    // Free the second volunteer's slot so they can take the facilitator one.
    await setFacilitator(group.id, null, "coFacilitator", { eventId: event.id })

    const result = await setFacilitator(group.id, coFaci.vol.id, "facilitator", { eventId: event.id })

    expect(result.success).toBe(true)
    const updated = await readGroup(group.id)
    expect(updated?.facilitatorId).toBe(coFaci.vol.id)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["English"])
    expect(updated?.lifeStages.map((ls) => ls.id)).toEqual([lifeStage.id])
  })

  it("leaves the profile alone when the co-facilitator is unlinked", async () => {
    const { event, group, faci } = await seed()
    await withProfile(group.id, faci.ledGroup.id)

    const result = await setFacilitator(group.id, null, "coFacilitator", { eventId: event.id })

    expect(result.success).toBe(true)
    const updated = await readGroup(group.id)
    expect(updated?.coFacilitatorId).toBeNull()
    expect(updated?.facilitatorId).toBe(faci.vol.id)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.lifeStages).toHaveLength(1)
    expect(updated?.linkedSmallGroupId).toBe(faci.ledGroup.id)
  })

  it("preserves via updateBreakoutGroup when the facilitator is removed", async () => {
    const { event, group, faci } = await seed()
    const lifeStage = await withProfile(group.id, faci.ledGroup.id)

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({
        facilitatorId: null,
        linkedSmallGroupId: faci.ledGroup.id,
        lifeStageIds: [lifeStage.id],
        genderFocus: "Female",
        language: ["English"],
        ageRangeMin: 25,
        ageRangeMax: 35,
      })
    )

    expect(result.success).toBe(true)
    const updated = await readGroup(group.id)
    expect(updated?.facilitatorId).toBeNull()
    expect(updated?.linkedSmallGroupId).toBeNull()
    expect(updated?.lifeStages).toHaveLength(1)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["English"])
    expect(updated?.ageRangeMin).toBe(25)
  })

  // It is the transition that clears, not the state: a group that never had a
  // facilitator can still be given criteria, and saving it again keeps them.
  it("keeps criteria on a group that already had no facilitator", async () => {
    const { event, group } = await seed()
    const lifeStage = await db.lifeStage.create({ data: { name: "Singles", order: 0 } })
    await db.breakoutGroup.update({
      where: { id: group.id },
      data: { facilitatorId: null },
    })

    const result = await updateBreakoutGroup(
      group.id,
      { eventId: event.id },
      drawerPayload({
        facilitatorId: null,
        lifeStageIds: [lifeStage.id],
        genderFocus: "Mixed",
        language: ["Tagalog"],
      })
    )

    expect(result.success).toBe(true)
    const updated = await readGroup(group.id)
    expect(updated?.genderFocus).toBe("Mixed")
    expect(updated?.language).toEqual(["Tagalog"])
    expect(updated?.lifeStages.map((ls) => ls.id)).toEqual([lifeStage.id])
  })
})

// ─── DGroup leadership is independent of breakout criteria ──────────────────

describe("updateBreakoutGroup without DGroup leadership", () => {
  it("accepts a facilitator with no DGroup and an empty profile", async () => {
    const { event, group } = await seed()
    const committee = await db.volunteerCommittee.findFirstOrThrow({ where: { eventId: event.id } })
    const role = await db.committeeRole.findFirstOrThrow({ where: { committeeId: committee.id } })
    const member = await db.member.create({ data: { firstName: "New", lastName: "Facilitator", dateJoined: new Date(), language: [] } })
    const volunteer = await db.volunteer.create({ data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
    const result = await updateBreakoutGroup(group.id, { eventId: event.id }, drawerPayload({ facilitatorId: volunteer.id }))
    expect(result.success).toBe(true)
    expect((await db.breakoutGroup.findUnique({ where: { id: group.id } }))?.facilitatorId).toBe(volunteer.id)
  })
})

// ─── Event scoping ────────────────────────────────────────────────────────────

describe("updateBreakoutGroup event scoping", () => {
  it("refuses a group id that belongs to another event", async () => {
    const { group } = await seed()
    const other = await db.event.create({
      data: { name: "Other", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })

    const result = await updateBreakoutGroup(group.id, { eventId: other.id }, drawerPayload({ name: "Hijacked" }))

    expect(result.success).toBe(false)
    const unchanged = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(unchanged?.name).toBe("Breakout A")
  })
})
