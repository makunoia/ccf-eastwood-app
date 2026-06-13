import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching"

const DAY_MS = 24 * 60 * 60 * 1000

async function seedGroups() {
  const groupA = await db.smallGroup.create({ data: { name: "Group A" } })
  const groupB = await db.smallGroup.create({ data: { name: "Group B" } })
  return { groupA, groupB }
}

async function seedGuest(firstName = "Seeker") {
  return db.guest.create({
    data: { firstName, lastName: "Guest", language: [] },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroup", "Guest", "Member", "MatchingWeightConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("guest assignment cooldown", () => {
  it("returns all eligible groups when none are on cooldown", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
    expect(results.every((r) => !r.onCooldown)).toBe(true)
  })

  it("excludes a group with a recent pending guest assignment", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupA.id, guestId: otherGuest.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId)).toEqual([groupB.id])
    expect(results[0].onCooldown).toBeFalsy()
  })

  it("keeps the cooldown while a recent request is confirmed", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: groupA.id,
        guestId: otherGuest.id,
        status: "Confirmed",
        resolvedAt: new Date(),
      },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId)).toEqual([groupB.id])
  })

  it("releases the cooldown when the request is rejected", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: groupA.id,
        guestId: otherGuest.id,
        status: "Rejected",
        resolvedAt: new Date(),
      },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
  })

  it("releases the cooldown after the window has passed", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: groupA.id,
        guestId: otherGuest.id,
        status: "Pending",
        createdAt: new Date(Date.now() - 8 * DAY_MS), // outside default 7-day window
      },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
  })

  it("falls back to cooldown groups (flagged) when no other groups remain", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const guestX = await seedGuest("X")
    const guestY = await seedGuest("Y")

    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupA.id, guestId: guestX.id, status: "Pending" },
    })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupB.id, guestId: guestY.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
    expect(results.every((r) => r.onCooldown === true)).toBe(true)
  })

  it("is disabled when guestCooldownDays is 0", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.matchingWeightConfig.create({
      data: {
        context: "SmallGroup",
        lifeStage: 0.2, gender: 0.1, language: 0.1, age: 0.15, schedule: 0.15,
        location: 0.1, mode: 0.05, career: 0.05, capacity: 0.1,
        guestCooldownDays: 0,
      },
    })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupA.id, guestId: otherGuest.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
  })

  it("respects a custom cooldown window from settings", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const otherGuest = await seedGuest("Earlier")

    await db.matchingWeightConfig.create({
      data: {
        context: "SmallGroup",
        lifeStage: 0.2, gender: 0.1, language: 0.1, age: 0.15, schedule: 0.15,
        location: 0.1, mode: 0.05, career: 0.05, capacity: 0.1,
        guestCooldownDays: 14,
      },
    })
    // 10 days old — outside the default 7 but inside the configured 14
    await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: groupA.id,
        guestId: otherGuest.id,
        status: "Pending",
        createdAt: new Date(Date.now() - 10 * DAY_MS),
      },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId)).toEqual([groupB.id])
  })

  it("does not trigger a cooldown from member transfer requests", async () => {
    const { groupA, groupB } = await seedGroups()
    const seeker = await seedGuest()
    const member = await db.member.create({
      data: { firstName: "Transferring", lastName: "Member", dateJoined: new Date(), language: [] },
    })

    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupA.id, memberId: member.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ guestId: seeker.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
  })

  it("does not apply the cooldown to member transfer suggestions", async () => {
    const { groupA, groupB } = await seedGroups()
    const otherGuest = await seedGuest("Earlier")
    const member = await db.member.create({
      data: { firstName: "Searching", lastName: "Member", dateJoined: new Date(), language: [] },
    })

    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: groupA.id, guestId: otherGuest.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(results.map((r) => r.groupId).sort()).toEqual([groupA.id, groupB.id].sort())
  })
})
