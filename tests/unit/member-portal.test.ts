import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { verifyMemberMobile } from "@/app/me/actions"
import {
  requestGroupChange,
  cancelGroupChange,
  createLedGroup,
  deleteLedGroup,
  updateLedGroupDetails,
  addMemberToLedGroup,
  addCoupleToLedGroup,
  getSpouseForLedGroupMember,
  removeMemberFromLedGroup,
  searchMembersToAdd,
} from "@/app/me/[token]/actions"

const baseDetails = {
  name: "Renamed Group",
  groupType: "Regular",
  meetingFormat: "InPerson",
  locationCity: "Makati",
  language: ["English"],
  ageRangeMin: "20",
  ageRangeMax: "30",
  memberLimit: "12",
  scheduleDayOfWeek: 3,
  scheduleTimeStart: "19:00",
  scheduleTimeEnd: "21:00",
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(
  overrides: Partial<{
    firstName: string
    lastName: string
    phone: string | null
    smallGroupId: string | null
    upwardSatellite: string | null
  }> = {}
) {
  return db.member.create({
    data: {
      firstName: overrides.firstName ?? "Juan",
      lastName: overrides.lastName ?? "Dela Cruz",
      phone: overrides.phone ?? null,
      smallGroupId: overrides.smallGroupId ?? null,
      upwardSatellite: overrides.upwardSatellite ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

/**
 * Adding a group you lead requires having answered who your own leader is, so
 * every test that reaches `createLedGroup` needs a member who has. The satellite
 * is the cheapest of the three accepted answers — it needs no second group.
 */
async function seedDeclaredMember(
  overrides: Parameters<typeof seedMember>[0] = {}
) {
  return seedMember({ upwardSatellite: "CCF Cebu", ...overrides })
}

describe("verifyMemberMobile", () => {
  it("returns a token for a member matched by normalized phone", async () => {
    const member = await seedMember({ phone: "+63 917 123 4567" })

    // Raw local format must normalize to the canonical stored value
    const result = await verifyMemberMobile("09171234567")
    expect(result.success).toBe(true)
    if (!result.success) return

    const updated = await db.member.findUnique({ where: { id: member.id } })
    expect(updated?.selfServiceToken).toBe(result.data.token)
  })

  it("returns the same token on repeat verification", async () => {
    await seedMember({ phone: "+63 917 123 4567" })
    const first = await verifyMemberMobile("0917 123 4567")
    const second = await verifyMemberMobile("+63 917 123 4567")
    expect(first.success && second.success).toBe(true)
    if (!first.success || !second.success) return
    expect(second.data.token).toBe(first.data.token)
  })

  it("fails for an unknown number", async () => {
    const result = await verifyMemberMobile("0917 999 9999")
    expect(result.success).toBe(false)
  })
})

describe("requestGroupChange", () => {
  it("creates a pending transfer request with fromGroupId and a log entry", async () => {
    const leaderA = await seedMember({ firstName: "Leader", lastName: "A" })
    const leaderB = await seedMember({ firstName: "Leader", lastName: "B" })
    const groupA = await db.smallGroup.create({ data: { name: "Group A", leaderId: leaderA.id } })
    const groupB = await db.smallGroup.create({ data: { name: "Group B", leaderId: leaderB.id } })
    const member = await seedMember({ smallGroupId: groupA.id })
    await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "tok-1" } })

    const result = await requestGroupChange("tok-1", groupB.id)
    expect(result.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirst({ where: { memberId: member.id } })
    expect(request?.status).toBe("Pending")
    expect(request?.smallGroupId).toBe(groupB.id)
    expect(request?.fromGroupId).toBe(groupA.id)

    const log = await db.smallGroupLog.findFirst({ where: { smallGroupId: groupB.id } })
    expect(log?.action).toBe("TempAssignmentCreated")

    // Membership itself is unchanged until the leader confirms
    const unchanged = await db.member.findUnique({ where: { id: member.id } })
    expect(unchanged?.smallGroupId).toBe(groupA.id)
  })

  it("replaces a previous pending request instead of stacking", async () => {
    const leader = await seedMember({ firstName: "Leader", lastName: "X" })
    const groupB = await db.smallGroup.create({ data: { name: "Group B", leaderId: leader.id } })
    const groupC = await db.smallGroup.create({ data: { name: "Group C", leaderId: leader.id } })
    const member = await seedMember()
    await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "tok-2" } })

    await requestGroupChange("tok-2", groupB.id)
    const result = await requestGroupChange("tok-2", groupC.id)
    expect(result.success).toBe(true)

    const pending = await db.smallGroupMemberRequest.findMany({
      where: { memberId: member.id, status: "Pending" },
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].smallGroupId).toBe(groupC.id)
  })

  it("rejects an invalid token", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "G", leaderId: leader.id } })
    const result = await requestGroupChange("bogus", group.id)
    expect(result.success).toBe(false)
  })

  it("rejects a full group", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: { name: "Full", leaderId: leader.id, memberLimit: 1 },
    })
    await seedMember({ smallGroupId: group.id })
    const member = await seedMember()
    await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "tok-3" } })

    const result = await requestGroupChange("tok-3", group.id)
    expect(result.success).toBe(false)
  })
})

describe("cancelGroupChange", () => {
  it("marks the member's own pending request as rejected", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "G", leaderId: leader.id } })
    const member = await seedMember()
    await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "tok-4" } })
    await requestGroupChange("tok-4", group.id)
    const request = await db.smallGroupMemberRequest.findFirst({ where: { memberId: member.id } })

    const result = await cancelGroupChange("tok-4", request!.id)
    expect(result.success).toBe(true)

    const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request!.id } })
    expect(updated?.status).toBe("Rejected")
    expect(updated?.resolvedAt).not.toBeNull()
  })

  it("cannot cancel someone else's request", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "G", leaderId: leader.id } })
    const owner = await seedMember()
    await db.member.update({ where: { id: owner.id }, data: { selfServiceToken: "tok-owner" } })
    await requestGroupChange("tok-owner", group.id)
    const request = await db.smallGroupMemberRequest.findFirst({ where: { memberId: owner.id } })

    const other = await seedMember({ firstName: "Other" })
    await db.member.update({ where: { id: other.id }, data: { selfServiceToken: "tok-other" } })

    const result = await cancelGroupChange("tok-other", request!.id)
    expect(result.success).toBe(false)
  })
})

describe("createLedGroup", () => {
  it("creates a new group led by the token holder with a GroupCreated log", async () => {
    const leader = await seedDeclaredMember({ firstName: "Lead", lastName: "Er" })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "new-1" } })

    const result = await createLedGroup("new-1", { ...baseDetails, name: "Fresh Group" })
    expect(result.success).toBe(true)
    if (!result.success) return

    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.name).toBe("Fresh Group")
    expect(group?.leaderId).toBe(leader.id)
    expect(group?.meetingFormat).toBe("InPerson")
    expect(group?.scheduleDayOfWeek).toBe(3)

    const log = await db.smallGroupLog.findFirst({ where: { smallGroupId: result.data.id } })
    expect(log?.action).toBe("GroupCreated")
    expect(log?.performedByMemberId).toBe(leader.id)
  })

  it("stamps a declared satellite onto the new group", async () => {
    // The satellite is declared before the first group exists, so the group has
    // to inherit it — that is where the admin form reads it from.
    const leader = await seedDeclaredMember({ upwardSatellite: "CCF Davao" })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "sat-new" } })

    const result = await createLedGroup("sat-new", { ...baseDetails, name: "Inherits" })
    expect(result.success).toBe(true)
    if (!result.success) return

    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.parentSatellite).toBe("CCF Davao")
  })

  it("lets a leader who already leads a group add another", async () => {
    const leader = await seedDeclaredMember()
    await db.smallGroup.create({ data: { name: "First", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "new-2" } })

    const result = await createLedGroup("new-2", { ...baseDetails, name: "Second" })
    expect(result.success).toBe(true)

    const led = await db.smallGroup.findMany({ where: { leaderId: leader.id } })
    expect(led).toHaveLength(2)
  })

  it("rejects an invalid token", async () => {
    const result = await createLedGroup("bogus", baseDetails)
    expect(result.success).toBe(false)
  })

  it("rejects a missing name", async () => {
    const leader = await seedDeclaredMember()
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "new-3" } })
    const result = await createLedGroup("new-3", { ...baseDetails, name: "" })
    expect(result.success).toBe(false)
  })

  describe("the leader-first gate", () => {
    it("refuses someone who hasn't said who their own leader is", async () => {
      const member = await seedMember()
      await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "gate-1" } })

      const result = await createLedGroup("gate-1", baseDetails)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toMatch(/who your DGroup leader is/i)
      expect(await db.smallGroup.count()).toBe(0)
    })

    it("accepts a member who belongs to a DGroup here", async () => {
      const other = await seedMember({ firstName: "Other", lastName: "Leader" })
      const group = await db.smallGroup.create({
        data: { name: "Theirs", leaderId: other.id },
      })
      const member = await seedMember({ smallGroupId: group.id })
      await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "gate-2" } })

      expect((await createLedGroup("gate-2", baseDetails)).success).toBe(true)
    })

    it("accepts a member with a pending request — answering is enough, confirmation isn't required", async () => {
      const other = await seedMember({ firstName: "Other", lastName: "Leader" })
      const group = await db.smallGroup.create({
        data: { name: "Theirs", leaderId: other.id },
      })
      const member = await seedMember()
      await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "gate-3" } })
      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, memberId: member.id, status: "Pending" },
      })

      expect((await createLedGroup("gate-3", baseDetails)).success).toBe(true)
    })

    it("does not count a request that has already been resolved", async () => {
      const other = await seedMember({ firstName: "Other", lastName: "Leader" })
      const group = await db.smallGroup.create({
        data: { name: "Theirs", leaderId: other.id },
      })
      const member = await seedMember()
      await db.member.update({ where: { id: member.id }, data: { selfServiceToken: "gate-4" } })
      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, memberId: member.id, status: "Rejected" },
      })

      expect((await createLedGroup("gate-4", baseDetails)).success).toBe(false)
    })
  })
})

describe("deleteLedGroup", () => {
  async function seedEmptyLedGroup(token: string) {
    const leader = await seedDeclaredMember()
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: token } })
    const group = await db.smallGroup.create({
      data: { name: "Disposable", leaderId: leader.id },
    })
    return { leader, group }
  }

  it("deletes an empty group the token holder leads", async () => {
    const { group } = await seedEmptyLedGroup("del-1")

    const result = await deleteLedGroup("del-1", group.id)
    expect(result.success).toBe(true)
    expect(await db.smallGroup.findUnique({ where: { id: group.id } })).toBeNull()
  })

  it("refuses a group that still has members", async () => {
    const { group } = await seedEmptyLedGroup("del-2")
    await seedMember({ firstName: "Still", lastName: "Here", smallGroupId: group.id })

    const result = await deleteLedGroup("del-2", group.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/remove everyone/i)
    expect(await db.smallGroup.findUnique({ where: { id: group.id } })).not.toBeNull()
  })

  it("refuses a group other groups report to", async () => {
    const { leader, group } = await seedEmptyLedGroup("del-3")
    await db.smallGroup.create({
      data: { name: "Child", leaderId: leader.id, parentGroupId: group.id },
    })

    const result = await deleteLedGroup("del-3", group.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/report to this one/i)
  })

  it("refuses a group with someone waiting to join", async () => {
    const { group } = await seedEmptyLedGroup("del-4")
    const hopeful = await seedMember({ firstName: "Wait", lastName: "Ing" })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, memberId: hopeful.id, status: "Pending" },
    })

    const result = await deleteLedGroup("del-4", group.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/waiting to join/i)
  })

  it("ignores a resolved request", async () => {
    const { group } = await seedEmptyLedGroup("del-5")
    const past = await seedMember({ firstName: "Was", lastName: "Rejected" })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, memberId: past.id, status: "Rejected" },
    })

    expect((await deleteLedGroup("del-5", group.id)).success).toBe(true)
  })

  it("refuses a group the token holder does not lead", async () => {
    const stranger = await seedDeclaredMember({ firstName: "Not", lastName: "Mine" })
    await db.member.update({ where: { id: stranger.id }, data: { selfServiceToken: "del-6" } })
    const { group } = await seedEmptyLedGroup("del-6-owner")

    const result = await deleteLedGroup("del-6", group.id)
    expect(result.success).toBe(false)
    expect(await db.smallGroup.findUnique({ where: { id: group.id } })).not.toBeNull()
  })
})

describe("updateLedGroupDetails", () => {
  it("updates logistics + matching fields on a led group", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Old", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "det-1" } })

    const result = await updateLedGroupDetails("det-1", group.id, baseDetails)
    expect(result.success).toBe(true)

    const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(updated?.name).toBe("Renamed Group")
    expect(updated?.meetingFormat).toBe("InPerson")
    expect(updated?.locationCity).toBe("Makati")
    expect(updated?.language).toEqual(["English"])
    expect(updated?.ageRangeMin).toBe(20)
    expect(updated?.ageRangeMax).toBe(30)
    expect(updated?.memberLimit).toBe(12)
    expect(updated?.scheduleDayOfWeek).toBe(3)
    expect(updated?.scheduleTimeStart).toBe("19:00")
    expect(updated?.scheduleTimeEnd).toBe("21:00")
  })

  it("clears optional fields when passed blank strings", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: {
        name: "Old",
        leaderId: leader.id,
        locationCity: "Makati",
        memberLimit: 10,
        ageRangeMin: 18,
        ageRangeMax: 40,
      },
    })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "det-2" } })

    const result = await updateLedGroupDetails("det-2", group.id, {
      ...baseDetails,
      locationCity: "",
      memberLimit: "",
      ageRangeMin: "",
      ageRangeMax: "",
      language: [],
    })
    expect(result.success).toBe(true)

    const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(updated?.locationCity).toBeNull()
    expect(updated?.memberLimit).toBeNull()
    expect(updated?.ageRangeMin).toBeNull()
    expect(updated?.ageRangeMax).toBeNull()
    expect(updated?.language).toEqual([])
  })

  it("refuses a group the member does not lead", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    const outsider = await seedMember({ firstName: "Outsider" })
    await db.member.update({ where: { id: outsider.id }, data: { selfServiceToken: "det-3" } })

    const result = await updateLedGroupDetails("det-3", group.id, baseDetails)
    expect(result.success).toBe(false)
  })

  it("rejects end time before start time", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "det-4" } })

    const result = await updateLedGroupDetails("det-4", group.id, {
      ...baseDetails,
      scheduleTimeStart: "21:00",
      scheduleTimeEnd: "19:00",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a member limit below the current roster size", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "det-5" } })
    await seedMember({ smallGroupId: group.id })
    await seedMember({ firstName: "Second", smallGroupId: group.id })

    const result = await updateLedGroupDetails("det-5", group.id, {
      ...baseDetails,
      memberLimit: "1",
    })
    expect(result.success).toBe(false)

    const unchanged = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(unchanged?.name).toBe("Led")
  })
})

describe("couples groups", () => {
  async function seedCouple(groupId?: string | null) {
    const husband = await seedMember({ firstName: "Juan", lastName: "Santos", smallGroupId: groupId ?? null })
    const wife = await seedMember({ firstName: "Maria", lastName: "Santos", smallGroupId: groupId ?? null })
    const family = await db.family.create({ data: { name: "Santos" } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, memberId: husband.id, role: "FatherHusband" },
        { familyId: family.id, memberId: wife.id, role: "MotherWife" },
      ],
    })
    return { husband, wife }
  }

  it("createLedGroup with Couples type sets Mixed gender focus", async () => {
    const leader = await seedDeclaredMember()
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "cpl-1" } })

    const result = await createLedGroup("cpl-1", {
      ...baseDetails,
      name: "Couples Circle",
      groupType: "Couples",
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.groupType).toBe("Couples")
    expect(group?.genderFocus).toBe("Mixed")
  })

  it("updateLedGroupDetails can convert a group to Couples (Mixed gender)", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Reg", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "cpl-2" } })

    const result = await updateLedGroupDetails("cpl-2", group.id, {
      ...baseDetails,
      groupType: "Couples",
    })
    expect(result.success).toBe(true)

    const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(updated?.groupType).toBe("Couples")
    expect(updated?.genderFocus).toBe("Mixed")
  })

  it("getSpouseForLedGroupMember resolves the spouse from Family data", async () => {
    const leader = await seedMember()
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "cpl-3" } })
    const { husband, wife } = await seedCouple()

    const result = await getSpouseForLedGroupMember("cpl-3", husband.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data?.memberId).toBe(wife.id)
  })

  it("addCoupleToLedGroup adds both spouses with MemberAdded logs", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: { name: "Couples", leaderId: leader.id, groupType: "Couples", genderFocus: "Mixed" },
    })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "cpl-4" } })
    const { husband, wife } = await seedCouple()

    const result = await addCoupleToLedGroup("cpl-4", group.id, husband.id, wife.id)
    expect(result.success).toBe(true)

    const [h, w] = await Promise.all([
      db.member.findUnique({ where: { id: husband.id } }),
      db.member.findUnique({ where: { id: wife.id } }),
    ])
    expect(h?.smallGroupId).toBe(group.id)
    expect(w?.smallGroupId).toBe(group.id)

    const logs = await db.smallGroupLog.findMany({
      where: { smallGroupId: group.id, action: "MemberAdded" },
    })
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.performedByMemberId === leader.id)).toBe(true)
  })

  it("addCoupleToLedGroup refuses when both spouses would exceed the member limit", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: { name: "Tiny", leaderId: leader.id, groupType: "Couples", memberLimit: 1 },
    })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "cpl-5" } })
    const { husband, wife } = await seedCouple()

    const result = await addCoupleToLedGroup("cpl-5", group.id, husband.id, wife.id)
    expect(result.success).toBe(false)

    const h = await db.member.findUnique({ where: { id: husband.id } })
    expect(h?.smallGroupId).toBeNull()
  })

  it("addCoupleToLedGroup refuses a group the token holder does not lead", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: { name: "Couples", leaderId: leader.id, groupType: "Couples" },
    })
    const outsider = await seedMember({ firstName: "Outsider" })
    await db.member.update({ where: { id: outsider.id }, data: { selfServiceToken: "cpl-6" } })
    const { husband, wife } = await seedCouple()

    const result = await addCoupleToLedGroup("cpl-6", group.id, husband.id, wife.id)
    expect(result.success).toBe(false)
  })
})

describe("led group roster", () => {
  it("adds a groupless member directly with a MemberAdded log", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "tok-8" } })
    const newcomer = await seedMember({ firstName: "New", lastName: "Comer" })

    const result = await addMemberToLedGroup("tok-8", group.id, newcomer.id)
    expect(result.success).toBe(true)

    const updated = await db.member.findUnique({ where: { id: newcomer.id } })
    expect(updated?.smallGroupId).toBe(group.id)
    expect(updated?.groupStatus).toBe("Member")

    const log = await db.smallGroupLog.findFirst({ where: { smallGroupId: group.id } })
    expect(log?.action).toBe("MemberAdded")
  })

  it("transfers a member from another group with a MemberTransferred log", async () => {
    const leaderA = await seedMember({ firstName: "Leader", lastName: "A" })
    const leaderB = await seedMember({ firstName: "Leader", lastName: "B" })
    const groupA = await db.smallGroup.create({ data: { name: "A", leaderId: leaderA.id } })
    const groupB = await db.smallGroup.create({ data: { name: "B", leaderId: leaderB.id } })
    await db.member.update({ where: { id: leaderB.id }, data: { selfServiceToken: "tok-9" } })
    const mover = await seedMember({ firstName: "Mover", smallGroupId: groupA.id })

    const result = await addMemberToLedGroup("tok-9", groupB.id, mover.id)
    expect(result.success).toBe(true)

    const updated = await db.member.findUnique({ where: { id: mover.id } })
    expect(updated?.smallGroupId).toBe(groupB.id)

    const log = await db.smallGroupLog.findFirst({ where: { smallGroupId: groupB.id } })
    expect(log?.action).toBe("MemberTransferred")
    expect(log?.fromGroupId).toBe(groupA.id)
  })

  it("enforces the member limit", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({
      data: { name: "Full", leaderId: leader.id, memberLimit: 1 },
    })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "tok-10" } })
    await seedMember({ smallGroupId: group.id })
    const extra = await seedMember({ firstName: "Extra" })

    const result = await addMemberToLedGroup("tok-10", group.id, extra.id)
    expect(result.success).toBe(false)
  })

  it("removes a member from a led group with a MemberRemoved log", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "tok-11" } })
    const target = await seedMember({ firstName: "Target", smallGroupId: group.id })
    await db.member.update({ where: { id: target.id }, data: { groupStatus: "Member" } })

    const result = await removeMemberFromLedGroup("tok-11", group.id, target.id)
    expect(result.success).toBe(true)

    const updated = await db.member.findUnique({ where: { id: target.id } })
    expect(updated?.smallGroupId).toBeNull()
    expect(updated?.groupStatus).toBeNull()

    const log = await db.smallGroupLog.findFirst({ where: { smallGroupId: group.id } })
    expect(log?.action).toBe("MemberRemoved")
  })

  it("cannot remove a member from a group the token holder does not lead", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    const target = await seedMember({ firstName: "Target", smallGroupId: group.id })
    const outsider = await seedMember({ firstName: "Outsider" })
    await db.member.update({ where: { id: outsider.id }, data: { selfServiceToken: "tok-12" } })

    const result = await removeMemberFromLedGroup("tok-12", group.id, target.id)
    expect(result.success).toBe(false)

    const unchanged = await db.member.findUnique({ where: { id: target.id } })
    expect(unchanged?.smallGroupId).toBe(group.id)
  })

  it("search excludes current group members and reports current groups", async () => {
    const leader = await seedMember()
    const group = await db.smallGroup.create({ data: { name: "Led", leaderId: leader.id } })
    await db.member.update({ where: { id: leader.id }, data: { selfServiceToken: "tok-13" } })
    await seedMember({ firstName: "Maria", lastName: "Inside", smallGroupId: group.id })
    await seedMember({ firstName: "Maria", lastName: "Outside" })

    const result = await searchMembersToAdd("tok-13", group.id, "Maria")
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.members).toHaveLength(1)
    expect(result.data.members[0].name).toBe("Maria Outside")
  })
})
