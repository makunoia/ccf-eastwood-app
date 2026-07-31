/**
 * Meeting times are optional on both group sides. A group that only declares
 * its meeting day must (a) save, and (b) still be scored by the matching
 * engine — a day-only schedule is treated as "any time that day", not as a
 * missing schedule and not as midnight.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching"
import { createSmallGroup } from "@/app/(dashboard)/small-groups/actions"
import {
  createBreakoutGroup,
  updateBreakoutGroup,
} from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Event", "Member", "Guest", "SmallGroup", "SmallGroupLog", "SmallGroupMemberRequest", "LifeStage", "MatchingWeightConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const baseGroupForm = {
  name: "Test Group",
  parentScope: "none" as const,
  parentGroupId: "",
  parentSatellite: "",
  groupType: "Regular",
  genderFocus: "Mixed",
  language: [],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "InPerson",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "2",
  scheduleTimeStart: "",
  scheduleTimeEnd: "",
}

async function seedLeaderAndStage() {
  const leader = await db.member.create({
    data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
  })
  const stage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
  return { leader, stage }
}

describe("small group — optional meeting times", () => {
  it("creates a group with a meeting day and no times", async () => {
    const { leader, stage } = await seedLeaderAndStage()

    const res = await createSmallGroup({
      ...baseGroupForm,
      leaderId: leader.id,
      lifeStageIds: [stage.id],
    })

    expect(res.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "Test Group" } })
    expect(group?.scheduleDayOfWeek).toBe(2)
    expect(group?.scheduleTimeStart).toBeNull()
    expect(group?.scheduleTimeEnd).toBeNull()
  })

  it("creates a group with a start time but no end time", async () => {
    const { leader, stage } = await seedLeaderAndStage()

    const res = await createSmallGroup({
      ...baseGroupForm,
      leaderId: leader.id,
      lifeStageIds: [stage.id],
      scheduleTimeStart: "19:00",
    })

    expect(res.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "Test Group" } })
    expect(group?.scheduleTimeStart).toBe("19:00")
    expect(group?.scheduleTimeEnd).toBeNull()
  })

  it("still refuses a group with no meeting day", async () => {
    const { leader, stage } = await seedLeaderAndStage()

    const res = await createSmallGroup({
      ...baseGroupForm,
      leaderId: leader.id,
      lifeStageIds: [stage.id],
      scheduleDayOfWeek: "",
    })

    expect(res.success).toBe(false)
    expect(await db.smallGroup.count()).toBe(0)
  })
})

describe("matching — a day-only group is still scored", () => {
  it("keeps a group with no meeting times in the results for a same-day candidate", async () => {
    const { leader, stage } = await seedLeaderAndStage()
    await db.smallGroup.create({
      data: {
        name: "Tuesday, any time",
        leaderId: leader.id,
        genderFocus: "Mixed",
        language: [],
        lifeStages: { connect: { id: stage.id } },
        scheduleDayOfWeek: 2,
        scheduleTimeStart: null,
        scheduleTimeEnd: null,
      },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Gee",
        lastName: "Est",
        language: [],
        lifeStageId: stage.id,
        scheduleDayOfWeek: 2,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      },
    })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(results.map((r) => r.groupName)).toContain("Tuesday, any time")
  })

  it("excludes it for a candidate who can only meet on another day", async () => {
    const { leader, stage } = await seedLeaderAndStage()
    await db.smallGroup.create({
      data: {
        name: "Tuesday, any time",
        leaderId: leader.id,
        genderFocus: "Mixed",
        language: [],
        lifeStages: { connect: { id: stage.id } },
        scheduleDayOfWeek: 2,
        scheduleTimeStart: null,
        scheduleTimeEnd: null,
      },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Gee",
        lastName: "Est",
        language: [],
        lifeStageId: stage.id,
        scheduleDayOfWeek: 4,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      },
    })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(results.map((r) => r.groupName)).not.toContain("Tuesday, any time")
  })
})

describe("breakout group — optional meeting times", () => {
  async function seedEvent() {
    return db.event.create({
      data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
  }

  const baseBreakoutForm = {
    name: "Table 1",
    facilitatorId: null,
    coFacilitatorId: null,
    memberLimit: null,
    lifeStageIds: [],
    genderFocus: null,
    language: [],
    ageRangeMin: null,
    ageRangeMax: null,
    meetingFormat: null,
    locationCity: null,
    linkedSmallGroupId: null,
  }

  it("stores a day-only schedule row", async () => {
    const event = await seedEvent()

    const res = await createBreakoutGroup(event.id, {
      ...baseBreakoutForm,
      schedule: { dayOfWeek: 6, timeStart: null, timeEnd: null },
    })

    expect(res.success).toBe(true)
    if (!res.success) return
    const schedules = await db.breakoutGroupSchedule.findMany({
      where: { breakoutGroupId: res.data.id },
    })
    expect(schedules).toHaveLength(1)
    expect(schedules[0].dayOfWeek).toBe(6)
    expect(schedules[0].timeStart).toBeNull()
    expect(schedules[0].timeEnd).toBeNull()
  })

  it("clears the times on update without dropping the day", async () => {
    const event = await seedEvent()
    const created = await createBreakoutGroup(event.id, {
      ...baseBreakoutForm,
      schedule: { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const res = await updateBreakoutGroup(created.data.id, event.id, {
      ...baseBreakoutForm,
      schedule: { dayOfWeek: 6, timeStart: null, timeEnd: null },
    })

    expect(res.success).toBe(true)
    const schedules = await db.breakoutGroupSchedule.findMany({
      where: { breakoutGroupId: created.data.id },
    })
    expect(schedules).toHaveLength(1)
    expect(schedules[0].dayOfWeek).toBe(6)
    expect(schedules[0].timeStart).toBeNull()
  })
})
