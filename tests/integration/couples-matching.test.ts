import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { matchCouplesGroups } from "@/lib/matching"
import { requestCoupleAssignment } from "@/app/(dashboard)/small-groups/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "MatchingWeightConfig", "SchedulePreference" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedCoupleMembers(overrides: { birthYearB?: number } = {}) {
  const husband = await db.member.create({
    data: {
      firstName: "H", lastName: "Couple", dateJoined: new Date(),
      language: ["English"], birthYear: 1990, birthMonth: 6,
    },
  })
  const wife = await db.member.create({
    data: {
      firstName: "W", lastName: "Couple", dateJoined: new Date(),
      language: ["English"], birthYear: overrides.birthYearB ?? 1991, birthMonth: 6,
    },
  })
  return { husband, wife }
}

describe("matchCouplesGroups", () => {
  it("returns only Couples groups", async () => {
    const { husband, wife } = await seedCoupleMembers()
    await db.smallGroup.create({ data: { name: "Regular G" } })
    const couples = await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples", genderFocus: "Mixed" },
    })

    const results = await matchCouplesGroups({ memberIdA: husband.id, memberIdB: wife.id })
    expect(results.map((r) => r.groupId)).toEqual([couples.id])
  })

  it("requires two free seats", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const occupant = await db.member.create({
      data: { firstName: "Occ", lastName: "Upant", dateJoined: new Date(), language: [] },
    })
    const tight = await db.smallGroup.create({
      data: { name: "Tight", groupType: "Couples", genderFocus: "Mixed", memberLimit: 2 },
    })
    await db.member.update({
      where: { id: occupant.id },
      data: { smallGroupId: tight.id, groupStatus: "Member" },
    })
    const roomy = await db.smallGroup.create({
      data: { name: "Roomy", groupType: "Couples", genderFocus: "Mixed", memberLimit: 4 },
    })

    const results = await matchCouplesGroups({ memberIdA: husband.id, memberIdB: wife.id })
    expect(results.map((r) => r.groupId)).toEqual([roomy.id])
  })

  it("excludes groups either spouse leads, belongs to, or was rejected by", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const ledByHusband = await db.smallGroup.create({
      data: { name: "Led", groupType: "Couples", leaderId: husband.id },
    })
    const wifesCurrent = await db.smallGroup.create({
      data: { name: "Current", groupType: "Couples" },
    })
    await db.member.update({
      where: { id: wife.id },
      data: { smallGroupId: wifesCurrent.id, groupStatus: "Member" },
    })
    const rejectedHusband = await db.smallGroup.create({
      data: { name: "Rejected", groupType: "Couples" },
    })
    await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: rejectedHusband.id,
        memberId: husband.id,
        status: "Rejected",
        resolvedAt: new Date(),
      },
    })
    const open = await db.smallGroup.create({
      data: { name: "Open", groupType: "Couples" },
    })

    const results = await matchCouplesGroups({ memberIdA: husband.id, memberIdB: wife.id })
    expect(results.map((r) => r.groupId)).toEqual([open.id])
    expect(results.map((r) => r.groupId)).not.toContain(ledByHusband.id)
  })

  it("ranks by worst-of score: a group fitting both beats one fitting only one spouse", async () => {
    // Wife born 1960 — outside the "young couples" 25–40 age range
    const { husband, wife } = await seedCoupleMembers({ birthYearB: 1960 })
    const fitsBoth = await db.smallGroup.create({
      data: { name: "Fits Both", groupType: "Couples", genderFocus: "Mixed" },
    })
    const youngOnly = await db.smallGroup.create({
      data: {
        name: "Young Couples",
        groupType: "Couples",
        genderFocus: "Mixed",
        ageRangeMin: 25,
        ageRangeMax: 40,
      },
    })

    const results = await matchCouplesGroups({ memberIdA: husband.id, memberIdB: wife.id })
    expect(results).toHaveLength(2)
    expect(results[0].groupId).toBe(fitsBoth.id)
    const youngResult = results.find((r) => r.groupId === youngOnly.id)!
    expect(youngResult.combinedScore).toBeLessThan(results[0].combinedScore)
    // combined = min of the two individual scores
    for (const r of results) {
      expect(r.combinedScore).toBeCloseTo(
        Math.min(r.resultA.totalScore, r.resultB.totalScore),
        10
      )
    }
  })

  it("returns empty for identical or missing members", async () => {
    const { husband } = await seedCoupleMembers()
    expect(await matchCouplesGroups({ memberIdA: husband.id, memberIdB: husband.id })).toEqual([])
    expect(await matchCouplesGroups({ memberIdA: husband.id, memberIdB: "nope" })).toEqual([])
  })
})

describe("requestCoupleAssignment", () => {
  it("creates paired pending requests with transfer metadata and logs", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const oldGroup = await db.smallGroup.create({ data: { name: "Old" } })
    await db.member.update({
      where: { id: husband.id },
      data: { smallGroupId: oldGroup.id, groupStatus: "Member" },
    })
    const couples = await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples" },
    })

    const result = await requestCoupleAssignment(couples.id, husband.id, wife.id)
    expect(result.success).toBe(true)

    const requests = await db.smallGroupMemberRequest.findMany({
      where: { smallGroupId: couples.id, status: "Pending" },
      orderBy: { createdAt: "asc" },
    })
    expect(requests).toHaveLength(2)
    const husbandReq = requests.find((r) => r.memberId === husband.id)!
    const wifeReq = requests.find((r) => r.memberId === wife.id)!
    expect(husbandReq.fromGroupId).toBe(oldGroup.id) // transfer records source
    expect(wifeReq.fromGroupId).toBeNull()

    // Members are NOT moved yet — leader confirmation does that
    const h = await db.member.findUnique({ where: { id: husband.id } })
    expect(h?.smallGroupId).toBe(oldGroup.id)

    const logs = await db.smallGroupLog.findMany({
      where: { smallGroupId: couples.id, action: "TempAssignmentCreated" },
    })
    expect(logs).toHaveLength(2)
  })

  it("rejects a Regular group target", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const regular = await db.smallGroup.create({ data: { name: "Regular" } })
    const result = await requestCoupleAssignment(regular.id, husband.id, wife.id)
    expect(result.success).toBe(false)
  })

  it("rejects when one spouse already has a pending request there", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const couples = await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples" },
    })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: couples.id, memberId: wife.id, status: "Pending" },
    })
    const result = await requestCoupleAssignment(couples.id, husband.id, wife.id)
    expect(result.success).toBe(false)
    expect(await db.smallGroupMemberRequest.count()).toBe(1) // nothing added
  })

  it("rejects when capacity cannot fit both or a spouse is already in the group", async () => {
    const { husband, wife } = await seedCoupleMembers()
    const full = await db.smallGroup.create({
      data: { name: "Full", groupType: "Couples", memberLimit: 1 },
    })
    expect((await requestCoupleAssignment(full.id, husband.id, wife.id)).success).toBe(false)

    const couples = await db.smallGroup.create({
      data: { name: "Has Wife", groupType: "Couples" },
    })
    await db.member.update({
      where: { id: wife.id },
      data: { smallGroupId: couples.id, groupStatus: "Member" },
    })
    expect((await requestCoupleAssignment(couples.id, husband.id, wife.id)).success).toBe(false)
  })

  it("rejects a member paired with themselves", async () => {
    const { husband } = await seedCoupleMembers()
    const couples = await db.smallGroup.create({
      data: { name: "C", groupType: "Couples" },
    })
    expect((await requestCoupleAssignment(couples.id, husband.id, husband.id)).success).toBe(false)
  })
})
