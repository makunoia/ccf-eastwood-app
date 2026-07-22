import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { findSpouse, mapCouplesInRoster } from "@/lib/family-links"
import { matchSmallGroups } from "@/lib/matching"
import {
  createSmallGroup,
  addCoupleToGroup,
  getSpouseForMember,
} from "@/app/(dashboard)/small-groups/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "LifeStage", "MatchingWeightConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(firstName: string, lastName = "Test") {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [] },
  })
}

async function seedCouple(familyName = "Couple Family") {
  const husband = await seedMember("Husband", familyName)
  const wife = await seedMember("Wife", familyName)
  const family = await db.family.create({ data: { name: familyName } })
  await db.familyMember.createMany({
    data: [
      { familyId: family.id, memberId: husband.id, role: "FatherHusband" },
      { familyId: family.id, memberId: wife.id, role: "MotherWife" },
    ],
  })
  return { husband, wife, family }
}

const baseGroupForm = {
  name: "Test Group",
  parentGroupId: "",
  language: [],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "InPerson",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "0",
  scheduleTimeStart: "09:00",
  scheduleTimeEnd: "10:30",
}

describe("findSpouse — derivation from Family data", () => {
  it("returns the other Father/Mother in a shared family", async () => {
    const { husband, wife } = await seedCouple()

    const spouse = await findSpouse(husband.id)
    expect(spouse?.memberId).toBe(wife.id)

    const reverse = await findSpouse(wife.id)
    expect(reverse?.memberId).toBe(husband.id)
  })

  it("returns null for a member who is only a Child in their family", async () => {
    const { family } = await seedCouple()
    const kid = await seedMember("Kid")
    await db.familyMember.create({
      data: { familyId: family.id, memberId: kid.id, role: "Child" },
    })

    expect(await findSpouse(kid.id)).toBeNull()
  })

  it("resolves the spouse from the member's own family, not their parents'", async () => {
    // Adult is a Child in their parents' family and a Father in their own
    const { family: parentsFamily } = await seedCouple("Parents")
    const adult = await seedMember("Adult")
    const adultsWife = await seedMember("AdultsWife")
    await db.familyMember.create({
      data: { familyId: parentsFamily.id, memberId: adult.id, role: "Child" },
    })
    const ownFamily = await db.family.create({ data: { name: "Own" } })
    await db.familyMember.createMany({
      data: [
        { familyId: ownFamily.id, memberId: adult.id, role: "FatherHusband" },
        { familyId: ownFamily.id, memberId: adultsWife.id, role: "MotherWife" },
      ],
    })

    const spouse = await findSpouse(adult.id)
    expect(spouse?.memberId).toBe(adultsWife.id)
  })

  it("returns null when the other parent is a guest (not yet a member)", async () => {
    const husband = await seedMember("Husband")
    const guestWife = await db.guest.create({
      data: { firstName: "GuestWife", lastName: "Test", language: [] },
    })
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, memberId: husband.id, role: "FatherHusband" },
        { familyId: family.id, guestId: guestWife.id, role: "MotherWife" },
      ],
    })

    expect(await findSpouse(husband.id)).toBeNull()
  })
})

describe("mapCouplesInRoster", () => {
  it("pairs roster members who share Father/Mother roles in one family", async () => {
    const { husband, wife } = await seedCouple()
    const single = await seedMember("Single")

    const pairs = await mapCouplesInRoster([husband.id, wife.id, single.id])
    expect(pairs.get(husband.id)).toBe(wife.id)
    expect(pairs.get(wife.id)).toBe(husband.id)
    expect(pairs.has(single.id)).toBe(false)
  })

  it("does not pair a parent with their child", async () => {
    const { husband, family } = await seedCouple()
    const kid = await seedMember("Kid")
    await db.familyMember.create({
      data: { familyId: family.id, memberId: kid.id, role: "Child" },
    })

    // Wife not in roster — husband + kid share a family but are not a couple
    const pairs = await mapCouplesInRoster([husband.id, kid.id])
    expect(pairs.size).toBe(0)
  })
})

describe("createSmallGroup — groupType", () => {
  it("defaults to Regular when groupType is omitted from the form", async () => {
    const leader = await seedMember("Leader")
    const ls = await db.lifeStage.create({ data: { name: "Adults", order: 1 } })

    const result = await createSmallGroup({
      ...baseGroupForm,
      leaderId: leader.id,
      groupType: "",
      lifeStageIds: [ls.id],
      genderFocus: "Male",
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.groupType).toBe("Regular")
    expect(group?.genderFocus).toBe("Male") // untouched for regular groups
  })

  it("forces genderFocus to Mixed for Couples groups", async () => {
    const leader = await seedMember("Leader")
    const ls = await db.lifeStage.create({ data: { name: "Adults", order: 1 } })

    const result = await createSmallGroup({
      ...baseGroupForm,
      leaderId: leader.id,
      groupType: "Couples",
      lifeStageIds: [ls.id],
      genderFocus: "Male", // deliberately wrong — server must normalize
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.groupType).toBe("Couples")
    expect(group?.genderFocus).toBe("Mixed")
  })
})

describe("addCoupleToGroup", () => {
  it("adds both spouses atomically with two log entries", async () => {
    const { husband, wife } = await seedCouple()
    const group = await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples" },
    })

    const result = await addCoupleToGroup(group.id, husband.id, wife.id)
    expect(result.success).toBe(true)

    const [h, w] = await Promise.all([
      db.member.findUnique({ where: { id: husband.id } }),
      db.member.findUnique({ where: { id: wife.id } }),
    ])
    expect(h?.smallGroupId).toBe(group.id)
    expect(w?.smallGroupId).toBe(group.id)
    expect(h?.groupStatus).toBe("Member")
    expect(w?.groupStatus).toBe("Member")

    const logs = await db.smallGroupLog.findMany({
      where: { smallGroupId: group.id, action: "MemberAdded" },
    })
    expect(logs).toHaveLength(2)
  })

  it("rejects the couple when the member limit cannot fit both", async () => {
    const { husband, wife } = await seedCouple()
    const existing = await seedMember("Existing")
    const group = await db.smallGroup.create({
      data: { name: "Tight G", groupType: "Couples", memberLimit: 2 },
    })
    await db.member.update({
      where: { id: existing.id },
      data: { smallGroupId: group.id, groupStatus: "Member" },
    })

    const result = await addCoupleToGroup(group.id, husband.id, wife.id)
    expect(result.success).toBe(false)

    // Neither spouse was added
    const [h, w] = await Promise.all([
      db.member.findUnique({ where: { id: husband.id } }),
      db.member.findUnique({ where: { id: wife.id } }),
    ])
    expect(h?.smallGroupId).toBeNull()
    expect(w?.smallGroupId).toBeNull()
  })

  it("rejects a member paired with themselves", async () => {
    const solo = await seedMember("Solo")
    const group = await db.smallGroup.create({
      data: { name: "G", groupType: "Couples" },
    })
    const result = await addCoupleToGroup(group.id, solo.id, solo.id)
    expect(result.success).toBe(false)
  })
})

describe("getSpouseForMember action", () => {
  it("returns spouse info including their current group", async () => {
    const { husband, wife } = await seedCouple()
    const someGroup = await db.smallGroup.create({ data: { name: "Existing G" } })
    await db.member.update({
      where: { id: wife.id },
      data: { smallGroupId: someGroup.id, groupStatus: "Member" },
    })

    const result = await getSpouseForMember(husband.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data?.memberId).toBe(wife.id)
    expect(result.data?.smallGroupId).toBe(someGroup.id)
  })
})

describe("matching excludes Couples groups from individual suggestions", () => {
  it("suggests only Regular groups to a guest", async () => {
    const regular = await db.smallGroup.create({ data: { name: "Regular G" } })
    await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples" },
    })
    const guest = await db.guest.create({
      data: { firstName: "Seeker", lastName: "Guest", language: [] },
    })

    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results.map((r) => r.groupId)).toEqual([regular.id])
  })

  it("suggests only Regular groups to a member (regression: Regular default keeps prior behavior)", async () => {
    const regular = await db.smallGroup.create({ data: { name: "Regular G" } })
    await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples" },
    })
    const member = await seedMember("Seeker")

    const results = await matchSmallGroups({ memberId: member.id })
    expect(results.map((r) => r.groupId)).toEqual([regular.id])
  })
})
