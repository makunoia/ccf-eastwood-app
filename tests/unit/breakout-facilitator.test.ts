import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { revalidatePath } from "next/cache"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { db } from "@/lib/db"
import { setFacilitator } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
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
    expect(result.error).toMatch(/different/i)
    const unchanged = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(unchanged?.coFacilitatorId).toBeNull()
  })

  it("returns error when volunteer does not belong to the event", async () => {
    const { event, breakoutGroup } = await seedEventWithVolunteers()

    const result = await setFacilitator(breakoutGroup.id, "nonexistent-volunteer-id", "coFacilitator", event.id)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/volunteer not found/i)
  })

  it("returns error when breakout group does not exist", async () => {
    const { event, vol1 } = await seedEventWithVolunteers()

    const result = await setFacilitator("nonexistent-group-id", vol1.id, "coFacilitator", event.id)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
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
