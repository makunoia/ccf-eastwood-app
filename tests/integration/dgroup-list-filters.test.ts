import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { dGroupFilterWhere, parseDGroupFilters } from "@/lib/small-groups/list-filters"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member", "LifeStage" RESTART IDENTITY CASCADE`
  const leader = await db.member.create({ data: { firstName: "Maria", lastName: "Santos", dateJoined: new Date(), language: [] } })
  for (const [name, time] of [["Morning", "11:59"], ["Noon", "12:00"], ["Evening", "18:00"], ["Unscheduled", null]] as const) {
    await db.smallGroup.create({ data: { name, leaderId: leader.id, scheduleDayOfWeek: time ? 0 : null, scheduleTimeStart: time, locationCity: "Pasig", language: ["English"], parentSatellite: name === "Evening" ? "CCF Main" : null } })
  }
})
afterAll(async () => { await db.$disconnect() })

async function names(params: Record<string, string>) {
  return (await db.smallGroup.findMany({ where: dGroupFilterWhere(parseDGroupFilters(params)), orderBy: { name: "asc" }, select: { name: true } })).map((g) => g.name)
}

describe("DGroup list query", () => {
  it("combines Sunday, city, language, leader search and meeting time", async () => {
    expect(await names({ search: "Maria Santos", day: "0", city: "pasig", language: "English", timeOfDay: "afternoon" })).toEqual(["Noon"])
    expect(await names({ timeOfDay: "morning" })).toEqual(["Morning"])
    expect(await names({ timeOfDay: "evening" })).toEqual(["Evening"])
    expect(await names({ language: "Tagalog" })).toEqual([])
  })

  it("finds missing schedules without letting a satellite through the no-parent filter", async () => {
    expect(await names({ day: "missing", timeOfDay: "missing", parent: "missing", lifeStageId: "missing" })).toEqual(["Unscheduled"])
    expect(await names({ parent: "satellite" })).toEqual(["Evening"])
    expect(await names({ day: "0", parent: "missing" })).toEqual(["Morning", "Noon"])
  })
})
