/**
 * End-to-end behaviour of the "leader is from another CCF satellite" option on
 * the DGroup form: the satellite persists, it never coexists with a parent
 * group, and switching to it undoes the auto-assignment the parent group made.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  createSmallGroup,
  updateSmallGroup,
} from "@/app/(dashboard)/small-groups/actions"
import type { SmallGroupFormValues } from "@/lib/validations/small-group"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupLog", "SmallGroupMemberRequest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedLeader(firstName = "Lead") {
  return db.member.create({
    data: { firstName, lastName: "Er", dateJoined: new Date(), language: [] },
  })
}

async function seedLifeStage() {
  return db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
}

function form(overrides: Partial<SmallGroupFormValues>): SmallGroupFormValues {
  return {
    name: "Test Group",
    leaderId: "",
    parentScope: "none",
    parentGroupId: "",
    parentSatellite: "",
    groupType: "Regular",
    lifeStageIds: [],
    genderFocus: "Mixed",
    language: [],
    ageRangeMin: "",
    ageRangeMax: "",
    meetingFormat: "InPerson",
    locationCity: "",
    memberLimit: "",
    scheduleDayOfWeek: "2",
    scheduleTimeStart: "19:00",
    scheduleTimeEnd: "21:00",
    ...overrides,
  }
}

describe("createSmallGroup — parent satellite", () => {
  it("persists the satellite and leaves the parent group empty", async () => {
    const stage = await seedLifeStage()
    const leader = await seedLeader()

    const res = await createSmallGroup(
      form({
        name: "Satellite-led Group",
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Baguio",
      })
    )

    expect(res.success).toBe(true)
    if (!res.success) return

    const group = await db.smallGroup.findUnique({ where: { id: res.data.id } })
    expect(group?.parentSatellite).toBe("CCF Baguio")
    expect(group?.parentGroupId).toBeNull()
  })

  it("does not assign the leader to any local group when the parent is a satellite", async () => {
    const stage = await seedLifeStage()
    const parentLeader = await seedLeader("Parent")
    const leader = await seedLeader("Child")
    const parent = await db.smallGroup.create({
      data: { name: "Parent Group", leaderId: parentLeader.id, language: [] },
    })

    const res = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        // The picker sends both when a group was chosen before switching over —
        // the satellite must win and the leader must stay unassigned.
        parentScope: "satellite",
        parentGroupId: parent.id,
        parentSatellite: "CCF Cebu",
      })
    )

    expect(res.success).toBe(true)

    const refreshed = await db.member.findUnique({ where: { id: leader.id } })
    expect(refreshed?.smallGroupId).toBeNull()
    expect(refreshed?.groupStatus).toBeNull()
  })

  it("rejects an unknown satellite", async () => {
    const stage = await seedLifeStage()
    const leader = await seedLeader()

    const res = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Singapore",
      })
    )

    expect(res.success).toBe(false)
    expect(await db.smallGroup.count()).toBe(0)
  })

  it("rejects the satellite scope with nothing picked", async () => {
    const stage = await seedLifeStage()
    const leader = await seedLeader()

    const res = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "",
      })
    )

    expect(res.success).toBe(false)
    expect(await db.smallGroup.count()).toBe(0)
  })
})

describe("updateSmallGroup — parent satellite", () => {
  it("swaps a parent group for a satellite and releases the leader's membership", async () => {
    const stage = await seedLifeStage()
    const parentLeader = await seedLeader("Parent")
    const leader = await seedLeader("Child")
    const parent = await db.smallGroup.create({
      data: { name: "Parent Group", leaderId: parentLeader.id, language: [] },
    })

    const created = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "group",
        parentGroupId: parent.id,
      })
    )
    expect(created.success).toBe(true)
    if (!created.success) return

    // Creating with a parent group enrols the leader in it.
    const afterCreate = await db.member.findUnique({ where: { id: leader.id } })
    expect(afterCreate?.smallGroupId).toBe(parent.id)

    const updated = await updateSmallGroup(
      created.data.id,
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Davao",
      })
    )
    expect(updated.success).toBe(true)

    const group = await db.smallGroup.findUnique({ where: { id: created.data.id } })
    expect(group?.parentSatellite).toBe("CCF Davao")
    expect(group?.parentGroupId).toBeNull()

    const afterUpdate = await db.member.findUnique({ where: { id: leader.id } })
    expect(afterUpdate?.smallGroupId).toBeNull()
    expect(afterUpdate?.groupStatus).toBeNull()
  })

  it("leaves a hand-picked membership alone when switching to a satellite", async () => {
    const stage = await seedLifeStage()
    const otherLeader = await seedLeader("Other")
    const leader = await seedLeader("Child")
    const parent = await db.smallGroup.create({
      data: { name: "Parent Group", leaderId: otherLeader.id, language: [] },
    })
    const unrelated = await db.smallGroup.create({
      data: { name: "Unrelated Group", leaderId: otherLeader.id, language: [] },
    })

    const created = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "group",
        parentGroupId: parent.id,
      })
    )
    expect(created.success).toBe(true)
    if (!created.success) return

    // An admin later moves the leader somewhere else by hand.
    await db.member.update({
      where: { id: leader.id },
      data: { smallGroupId: unrelated.id, groupStatus: "Member" },
    })

    const updated = await updateSmallGroup(
      created.data.id,
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Cebu",
      })
    )
    expect(updated.success).toBe(true)

    const afterUpdate = await db.member.findUnique({ where: { id: leader.id } })
    expect(afterUpdate?.smallGroupId).toBe(unrelated.id)
  })

  it("swaps a satellite back for a parent group", async () => {
    const stage = await seedLifeStage()
    const parentLeader = await seedLeader("Parent")
    const leader = await seedLeader("Child")
    const parent = await db.smallGroup.create({
      data: { name: "Parent Group", leaderId: parentLeader.id, language: [] },
    })

    const created = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Iloilo",
      })
    )
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = await updateSmallGroup(
      created.data.id,
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "group",
        parentGroupId: parent.id,
      })
    )
    expect(updated.success).toBe(true)

    const group = await db.smallGroup.findUnique({ where: { id: created.data.id } })
    expect(group?.parentGroupId).toBe(parent.id)
    expect(group?.parentSatellite).toBeNull()

    const refreshed = await db.member.findUnique({ where: { id: leader.id } })
    expect(refreshed?.smallGroupId).toBe(parent.id)
  })

  it("clears the satellite when the parent is set back to none", async () => {
    const stage = await seedLifeStage()
    const leader = await seedLeader()

    const created = await createSmallGroup(
      form({
        leaderId: leader.id,
        lifeStageIds: [stage.id],
        parentScope: "satellite",
        parentSatellite: "CCF Tarlac",
      })
    )
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = await updateSmallGroup(
      created.data.id,
      form({ leaderId: leader.id, lifeStageIds: [stage.id], parentScope: "none" })
    )
    expect(updated.success).toBe(true)

    const group = await db.smallGroup.findUnique({ where: { id: created.data.id } })
    expect(group?.parentSatellite).toBeNull()
    expect(group?.parentGroupId).toBeNull()
  })
})
