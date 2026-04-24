import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching/index"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "MatchingWeightConfig", "SmallGroup", "Guest", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedLeader() {
  return db.member.create({
    data: { firstName: "Leader", lastName: "Test", dateJoined: new Date() },
    select: { id: true },
  })
}

async function seedGroup(leaderId: string, overrides: Partial<{
  name: string
  genderFocus: "Male" | "Female" | "Mixed"
  lifeStageId: string
  memberLimit: number
  language: string[]
}> = {}) {
  return db.smallGroup.create({
    data: {
      name: overrides.name ?? "Test Group",
      leaderId,
      genderFocus: overrides.genderFocus ?? null,
      lifeStageId: overrides.lifeStageId ?? null,
      memberLimit: overrides.memberLimit ?? null,
      language: overrides.language ?? [],
    },
    select: { id: true },
  })
}

describe("matchSmallGroups (guest)", () => {
  it("returns an empty array when no groups exist", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })
    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results).toHaveLength(0)
  })

  it("returns an empty array when the guest does not exist", async () => {
    const results = await matchSmallGroups({ guestId: "non-existent" })
    expect(results).toHaveLength(0)
  })

  it("returns scored results with groupId and totalScore", async () => {
    const leader = await seedLeader()
    await seedGroup(leader.id, { name: "Group A" })
    await seedGroup(leader.id, { name: "Group B" })

    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results).toHaveLength(2)
    for (const r of results) {
      expect(r.groupId).toBeTypeOf("string")
      expect(r.totalScore).toBeGreaterThanOrEqual(0)
      expect(r.totalScore).toBeLessThanOrEqual(1)
    }
  })

  it("results are sorted by totalScore descending", async () => {
    const leader = await seedLeader()
    // Create a female-only group — a male guest scores 0 on gender → filtered out
    await seedGroup(leader.id, { name: "Ladies Group", genderFocus: "Female" })
    // Create a mixed group — guest will score higher here
    await seedGroup(leader.id, { name: "Mixed Group", genderFocus: "Mixed" })

    const guest = await db.guest.create({
      data: { firstName: "John", lastName: "Doe", gender: "Male", language: [] },
      select: { id: true },
    })

    const results = await matchSmallGroups({ guestId: guest.id })
    // Female-only group should be filtered out
    expect(results.every((r) => r.groupName !== "Ladies Group")).toBe(true)
    // Remaining are sorted descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].totalScore).toBeGreaterThanOrEqual(results[i].totalScore)
    }
  })

  it("excludes full groups", async () => {
    const leader = await seedLeader()
    // Create a group with memberLimit 1 and fill it
    const fullGroup = await seedGroup(leader.id, { name: "Full Group", memberLimit: 1 })
    await db.member.create({
      data: {
        firstName: "Occupant",
        lastName: "O",
        dateJoined: new Date(),
        smallGroupId: fullGroup.id,
        groupStatus: "Member",
      },
    })
    await seedGroup(leader.id, { name: "Open Group" })

    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results.every((r) => r.groupName !== "Full Group")).toBe(true)
    expect(results.some((r) => r.groupName === "Open Group")).toBe(true)
  })

  it("respects the limit option", async () => {
    const leader = await seedLeader()
    for (let i = 0; i < 5; i++) {
      await seedGroup(leader.id, { name: `Group ${i}` })
    }
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const results = await matchSmallGroups({ guestId: guest.id }, { limit: 2 })
    expect(results).toHaveLength(2)
  })
})

describe("matchSmallGroups (member)", () => {
  it("returns an empty array when the member does not exist", async () => {
    const results = await matchSmallGroups({ memberId: "non-existent" })
    expect(results).toHaveLength(0)
  })

  it("excludes the group that the member currently leads", async () => {
    const leader = await seedLeader()
    const ownGroup = await seedGroup(leader.id, { name: "Own Group" })
    await seedGroup(leader.id, { name: "Other Group" })

    // Member leads ownGroup — it should be excluded
    const results = await matchSmallGroups({ memberId: leader.id })
    expect(results.every((r) => r.groupId !== ownGroup.id)).toBe(true)
  })

  it("excludes the member's current group when excludeCurrentGroup is set", async () => {
    const leader = await seedLeader()
    const currentGroup = await seedGroup(leader.id, { name: "Current Group" })
    await seedGroup(leader.id, { name: "Other Group" })

    const member = await db.member.create({
      data: {
        firstName: "Alice",
        lastName: "A",
        dateJoined: new Date(),
        smallGroupId: currentGroup.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    const results = await matchSmallGroups(
      { memberId: member.id },
      { excludeCurrentGroup: true }
    )
    expect(results.every((r) => r.groupId !== currentGroup.id)).toBe(true)
  })
})
