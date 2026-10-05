import { describe, expect, it } from "vitest"
import { dGroupFilterWhere, dGroupScheduleLabel, parseDGroupFilters } from "@/lib/small-groups/list-filters"

describe("DGroup list filters", () => {
  it("ignores malformed URL enums, arrays and day values", () => {
    const filters = parseDGroupFilters({ status: "invalid", day: "7", timeOfDay: "night", genderFocus: ["Male"], search: " Maria Santos ", meetingFormat: "Online" })
    expect(filters).toMatchObject({ status: "", day: "", timeOfDay: "", genderFocus: "", search: "Maria Santos", meetingFormat: "Online" })
    expect(dGroupFilterWhere(parseDGroupFilters({}))).toEqual({ AND: [] })
  })

  it("keeps Sunday and combines search and relation filters with AND", () => {
    const where = dGroupFilterWhere(parseDGroupFilters({ search: "Maria Santos", day: "0", lifeStageId: "ls1", leader: "m1", parent: "p1", city: "Pasig", language: "English", status: "Active" }))
    expect(where.AND).toEqual(expect.arrayContaining([
      { scheduleDayOfWeek: 0 }, { lifeStages: { some: { id: "ls1" } } },
      { leaderId: "m1" }, { parentGroupId: "p1" }, { status: "Active" },
      { locationCity: { equals: "Pasig", mode: "insensitive" } }, { language: { has: "English" } },
    ]))
    expect(where.AND).toContainEqual({ AND: [
      { OR: [{ name: { contains: "Maria", mode: "insensitive" } }, { leader: { firstName: { contains: "Maria", mode: "insensitive" } } }, { leader: { lastName: { contains: "Maria", mode: "insensitive" } } }] },
      { OR: [{ name: { contains: "Santos", mode: "insensitive" } }, { leader: { firstName: { contains: "Santos", mode: "insensitive" } } }, { leader: { lastName: { contains: "Santos", mode: "insensitive" } } }] },
    ] })
  })

  it.each([
    ["morning", { gte: "00:00", lt: "12:00" }],
    ["afternoon", { gte: "12:00", lt: "18:00" }],
    ["evening", { gte: "18:00", lt: "24:00" }],
  ])("filters %s by start time without overlapping boundaries", (timeOfDay, range) => {
    expect(dGroupFilterWhere(parseDGroupFilters({ timeOfDay }))).toEqual({ AND: [{ scheduleTimeStart: range }] })
  })

  it("keeps missing-data ORs separate so combined filters cannot overwrite each other", () => {
    expect(dGroupFilterWhere(parseDGroupFilters({ day: "missing", timeOfDay: "missing", parent: "missing", lifeStageId: "missing" }))).toEqual({ AND: [
      { lifeStages: { none: {} } }, { scheduleDayOfWeek: null },
      { OR: [{ scheduleTimeStart: null }, { scheduleTimeStart: "" }] },
      { parentGroupId: null, OR: [{ parentSatellite: null }, { parentSatellite: "" }] },
    ] })
  })

  it("distinguishes outside satellites from unparented groups", () => {
    expect(dGroupFilterWhere(parseDGroupFilters({ parent: "satellite" }))).toEqual({ AND: [{ parentGroupId: null, parentSatellite: { not: null }, NOT: { parentSatellite: "" } }] })
  })
})

describe("DGroup schedule labels", () => {
  it.each([
    [0, "09:00", "11:00", "Sunday · 9:00 AM – 11:00 AM"],
    [2, "19:00", null, "Tuesday · 7:00 PM"],
    [5, null, null, "Friday"],
    [null, null, null, "Not set"],
    [null, "12:00", null, "Day not set · 12:00 PM"],
  ])("renders day %s and time %s", (scheduleDayOfWeek, scheduleTimeStart, scheduleTimeEnd, label) => {
    expect(dGroupScheduleLabel({ scheduleDayOfWeek, scheduleTimeStart, scheduleTimeEnd })).toBe(label)
  })
})
