/**
 * Meeting schedule start/end times are optional on every group-side form —
 * admin Small Groups, the /me leader portal, and event breakout groups. The
 * meeting *day* stays required where it already was; only the times may be
 * left blank, and an inverted range is still refused when both are given.
 */
import { describe, it, expect } from "vitest"
import { smallGroupSchema } from "@/lib/validations/small-group"
import { breakoutGroupSchema } from "@/lib/validations/breakout-group"

const baseSmallGroup = {
  name: "Tuesday Nights",
  leaderId: "leader-1",
  parentScope: "none" as const,
  parentGroupId: "",
  parentSatellite: "",
  groupType: "Regular",
  lifeStageIds: ["ls-1"],
  genderFocus: "Mixed",
  language: ["English"],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "InPerson",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "2",
  scheduleTimeStart: "19:00",
  scheduleTimeEnd: "21:00",
}

describe("smallGroupSchema — meeting times", () => {
  it("accepts a day with both times", () => {
    const parsed = smallGroupSchema.safeParse(baseSmallGroup)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.scheduleTimeStart).toBe("19:00")
  })

  it("accepts a day with no times and stores them as null", () => {
    const parsed = smallGroupSchema.safeParse({
      ...baseSmallGroup,
      scheduleTimeStart: "",
      scheduleTimeEnd: "",
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.scheduleDayOfWeek).toBe(2)
    expect(parsed.success && parsed.data.scheduleTimeStart).toBeNull()
    expect(parsed.success && parsed.data.scheduleTimeEnd).toBeNull()
  })

  it.each([
    ["start only", { scheduleTimeStart: "19:00", scheduleTimeEnd: "" }],
    ["end only", { scheduleTimeStart: "", scheduleTimeEnd: "21:00" }],
  ])("accepts %s", (_label, times) => {
    expect(smallGroupSchema.safeParse({ ...baseSmallGroup, ...times }).success).toBe(true)
  })

  it("still requires the meeting day", () => {
    const parsed = smallGroupSchema.safeParse({
      ...baseSmallGroup,
      scheduleDayOfWeek: "",
      scheduleTimeStart: "",
      scheduleTimeEnd: "",
    })
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe("Meeting day is required")
  })

  it("still rejects an end time at or before the start", () => {
    const parsed = smallGroupSchema.safeParse({
      ...baseSmallGroup,
      scheduleTimeEnd: "19:00",
    })
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe(
      "End time must be after start time"
    )
  })

  it("still rejects a malformed time", () => {
    expect(
      smallGroupSchema.safeParse({ ...baseSmallGroup, scheduleTimeStart: "7pm" }).success
    ).toBe(false)
  })
})

const baseBreakout = {
  name: "Table 1",
  lifeStageIds: [],
  language: [],
}

describe("breakoutGroupSchema — meeting times", () => {
  it("accepts a schedule with both times", () => {
    const parsed = breakoutGroupSchema.safeParse({
      ...baseBreakout,
      schedule: { dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts a day-only schedule and nulls the times", () => {
    const parsed = breakoutGroupSchema.safeParse({
      ...baseBreakout,
      schedule: { dayOfWeek: 2, timeStart: "", timeEnd: null },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.schedule).toEqual({
      dayOfWeek: 2,
      timeStart: null,
      timeEnd: null,
    })
  })

  it("still accepts no schedule at all", () => {
    expect(
      breakoutGroupSchema.safeParse({ ...baseBreakout, schedule: null }).success
    ).toBe(true)
  })

  it("still rejects an end time at or before the start", () => {
    const parsed = breakoutGroupSchema.safeParse({
      ...baseBreakout,
      schedule: { dayOfWeek: 2, timeStart: "19:00", timeEnd: "19:00" },
    })
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe(
      "End time must be after start time"
    )
  })
})
