import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { revalidatePath } from "next/cache"

// These tests exercise setFacilitator's business logic, not its permissions —
// breakout-actions now requires an authenticated writer, so hand it one.
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
import { setFacilitator } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedEventWithVolunteers() {
  const event = await db.event.create({
    data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const member1 = await db.member.create({
    data: { firstName: "Alice", lastName: "A", dateJoined: new Date(), language: [] },
  })
  const member2 = await db.member.create({
    data: { firstName: "Bob", lastName: "B", dateJoined: new Date(), language: [] },
  })
  const vol1 = await db.volunteer.create({
    data: {
      memberId: member1.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  const vol2 = await db.volunteer.create({
    data: {
      memberId: member2.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  const breakoutGroup = await db.breakoutGroup.create({
    data: { name: "Group A", eventId: event.id },
  })
  return { event, committee, role, member1, member2, vol1, vol2, breakoutGroup }
}

// ─── setFacilitator ───────────────────────────────────────────────────────────

describe("setFacilitator", () => {
  it("assigns a facilitator and persists to DB", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()

    const result = await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.facilitatorId).toBe(vol1.id)
    expect(updated?.coFacilitatorId).toBeNull()
  })

  it("assigns a co-facilitator and persists to DB", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()

    const result = await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.coFacilitatorId).toBe(vol1.id)
    expect(updated?.facilitatorId).toBeNull()
  })

  it("allows assigning different volunteers as facilitator and co-facilitator", async () => {
    const { event, vol1, vol2, breakoutGroup } = await seedEventWithVolunteers()

    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id)
    const result = await setFacilitator(breakoutGroup.id, vol2.id, "coFacilitator", event.id)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.facilitatorId).toBe(vol1.id)
    expect(updated?.coFacilitatorId).toBe(vol2.id)
  })

  it("rejects assigning the same volunteer as both facilitator and co-facilitator", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()

    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id)
    const result = await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/different/i)
    const unchanged = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(unchanged?.coFacilitatorId).toBeNull()
  })

  it("returns error when volunteer does not belong to the event", async () => {
    const { event, breakoutGroup } = await seedEventWithVolunteers()

    const result = await setFacilitator(breakoutGroup.id, "nonexistent-volunteer-id", "coFacilitator", event.id)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/volunteer not found/i)
  })

  it("returns error when breakout group does not exist", async () => {
    const { event, vol1 } = await seedEventWithVolunteers()

    const result = await setFacilitator("nonexistent-group-id", vol1.id, "coFacilitator", event.id)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBeDefined()
  })

  it("clears facilitator when null is passed", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()
    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id)

    const result = await setFacilitator(breakoutGroup.id, null, "facilitator", event.id)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.facilitatorId).toBeNull()
  })

  it("clears co-facilitator when null is passed", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()
    await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id)

    const result = await setFacilitator(breakoutGroup.id, null, "coFacilitator", event.id)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.coFacilitatorId).toBeNull()
  })
})

// ─── Regression ───────────────────────────────────────────────────────────────

describe("regression", () => {
  it("setFacilitator revalidates /event/[id]/breakouts/[groupId], not /events/[id]", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()

    await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id)

    const calls = vi.mocked(revalidatePath).mock.calls.map(([path]) => path)
    expect(calls.some((p) => p.startsWith("/event/"))).toBe(true)
    expect(calls.some((p) => p.startsWith("/events/"))).toBe(false)
    expect(calls).toContain(`/event/${event.id}/breakouts/${breakoutGroup.id}`)
  })

  it("setFacilitator does not crash when called with undefined linkedSmallGroupId (co-facilitator path)", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()

    // Explicitly pass undefined as the 5th arg — the co-facilitator call from the client does this
    const result = await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id, undefined)

    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.coFacilitatorId).toBe(vol1.id)
  })

  it("setFacilitator does not clear linkedSmallGroupId when assigning co-facilitator", async () => {
    const { event, vol1, breakoutGroup } = await seedEventWithVolunteers()
    const leader = await db.member.create({
      data: { firstName: "Leader", lastName: "L", dateJoined: new Date(), language: [] },
    })
    const smallGroup = await db.smallGroup.create({
      data: { name: "Linked Group", leaderId: leader.id },
    })
    await db.breakoutGroup.update({
      where: { id: breakoutGroup.id },
      data: { linkedSmallGroupId: smallGroup.id },
    })

    // Assigning co-facilitator should not touch linkedSmallGroupId
    await setFacilitator(breakoutGroup.id, vol1.id, "coFacilitator", event.id, undefined)

    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.linkedSmallGroupId).toBe(smallGroup.id)
  })
})

// ─── The profile does NOT follow the facilitator ─────────────────────────────

/**
 * A breakout group's criteria are its own — hand-entered, always editable.
 * `setFacilitator` briefly copied them from the facilitator's linked DGroup
 * (CCF-138), which meant assigning someone silently rewrote what the group
 * matched for and made the profile read-only in both edit drawers. These tests
 * pin the reversal, and that the Catch Mech link still travels with the change.
 */
describe("setFacilitator leaves the matching profile alone", () => {
  async function seedLedGroup(leaderId: string, name: string) {
    const lifeStage = await db.lifeStage.create({
      data: { name: `${name} Stage`, order: 0 },
    })
    return db.smallGroup.create({
      data: {
        name,
        leaderId,
        genderFocus: "Male",
        language: ["English"],
        ageRangeMin: 25,
        ageRangeMax: 35,
        lifeStages: { connect: { id: lifeStage.id } },
      },
      include: { lifeStages: true },
    })
  }

  /** The group's own criteria, deliberately unlike any DGroup seeded below. */
  async function seedOwnProfile(groupId: string) {
    const lifeStage = await db.lifeStage.create({ data: { name: "Own Stage", order: 1 } })
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: {
        genderFocus: "Female",
        language: ["Cebuano"],
        ageRangeMin: 40,
        ageRangeMax: 50,
        lifeStages: { set: [{ id: lifeStage.id }] },
      },
    })
    return lifeStage
  }

  it("keeps the group's own criteria when a DGroup leader is assigned", async () => {
    const { event, member1, vol1, breakoutGroup } = await seedEventWithVolunteers()
    const ownStage = await seedOwnProfile(breakoutGroup.id)
    const sg = await seedLedGroup(member1.id, "Alpha")

    const result = await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id, sg.id)
    expect(result.success).toBe(true)

    const updated = await db.breakoutGroup.findUnique({
      where: { id: breakoutGroup.id },
      include: { lifeStages: true },
    })
    expect(updated?.facilitatorId).toBe(vol1.id)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["Cebuano"])
    expect(updated?.ageRangeMin).toBe(40)
    expect(updated?.ageRangeMax).toBe(50)
    expect(updated?.lifeStages.map((ls) => ls.id)).toEqual([ownStage.id])
  })

  it("keeps them across a reassignment to a different DGroup leader", async () => {
    const { event, member1, member2, vol1, vol2, breakoutGroup } =
      await seedEventWithVolunteers()
    await seedOwnProfile(breakoutGroup.id)
    const alpha = await seedLedGroup(member1.id, "Alpha")
    const beta = await seedLedGroup(member2.id, "Beta")

    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id, alpha.id)
    await setFacilitator(breakoutGroup.id, vol2.id, "facilitator", event.id, beta.id)

    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["Cebuano"])
  })

  it("keeps a Timothy's hand-entered profile", async () => {
    // member2 leads no DGroup — those criteria seed their future group.
    const { event, vol2, breakoutGroup } = await seedEventWithVolunteers()
    await seedOwnProfile(breakoutGroup.id)

    await setFacilitator(breakoutGroup.id, vol2.id, "facilitator", event.id, null)

    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.facilitatorId).toBe(vol2.id)
    expect(updated?.genderFocus).toBe("Female")
    expect(updated?.language).toEqual(["Cebuano"])
  })

  it("keeps them when the facilitator is unassigned", async () => {
    const { event, member1, vol1, breakoutGroup } = await seedEventWithVolunteers()
    await seedOwnProfile(breakoutGroup.id)
    const sg = await seedLedGroup(member1.id, "Alpha")
    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id, sg.id)

    await setFacilitator(breakoutGroup.id, null, "facilitator", event.id, null)

    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.facilitatorId).toBeNull()
    expect(updated?.linkedSmallGroupId).toBeNull()
    expect(updated?.genderFocus).toBe("Female")
  })

  // The link is not matching — it decides which DGroup receives this group's
  // Catch Mech member requests (`resolveLinkedSmallGroup`).
  it("still records the Catch Mech DGroup a facilitator change picks", async () => {
    const { event, member1, vol1, breakoutGroup } = await seedEventWithVolunteers()
    const sg = await seedLedGroup(member1.id, "Alpha")

    await setFacilitator(breakoutGroup.id, vol1.id, "facilitator", event.id, sg.id)

    const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(updated?.linkedSmallGroupId).toBe(sg.id)
  })
})
