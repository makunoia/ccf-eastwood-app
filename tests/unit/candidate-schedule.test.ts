/**
 * The candidate-side schedule on the DGroup Matching forms (member detail,
 * guest detail, public join form) is optional and must never block a search.
 * Blank means "no constraint"; a partly-filled entry is normalised rather than
 * rejected. The only refusal left is an end time at or before the start.
 */
import { describe, it, expect } from "vitest"
import {
  buildScheduleSlot,
  buildStoredScheduleSlot,
  isScheduleBlank,
  validateOptionalSchedule,
} from "@/lib/matching/candidate-schedule"

const blank = { scheduleDayOfWeek: "", scheduleTimeStart: "", scheduleTimeEnd: "" }
const full = { scheduleDayOfWeek: "2", scheduleTimeStart: "19:00", scheduleTimeEnd: "21:00" }

describe("validateOptionalSchedule", () => {
  it.each([
    ["completely blank", blank],
    ["fully filled", full],
    ["Sunday (day '0'), which is falsy as a number", { ...full, scheduleDayOfWeek: "0" }],
    ["day only", { ...blank, scheduleDayOfWeek: "2" }],
    ["day + start, no end", { ...full, scheduleTimeEnd: "" }],
    ["start time only", { ...blank, scheduleTimeStart: "19:00" }],
    ["end time only", { ...blank, scheduleTimeEnd: "21:00" }],
    ["times without a day", { ...full, scheduleDayOfWeek: "" }],
  ])("accepts %s", (_label, fields) => {
    expect(validateOptionalSchedule(fields)).toBeNull()
  })

  it("rejects an end time that is not after the start time", () => {
    expect(validateOptionalSchedule({ ...full, scheduleTimeEnd: "19:00" })).toBe(
      "Schedule end time must be after start time"
    )
    expect(validateOptionalSchedule({ ...full, scheduleTimeEnd: "18:00" })).toBe(
      "Schedule end time must be after start time"
    )
  })
})

describe("isScheduleBlank", () => {
  it("is true only when all three fields are empty", () => {
    expect(isScheduleBlank(blank)).toBe(true)
    expect(isScheduleBlank({ ...blank, scheduleDayOfWeek: "0" })).toBe(false)
    expect(isScheduleBlank(full)).toBe(false)
  })
})

describe("buildScheduleSlot", () => {
  it("builds a slot from a complete schedule", () => {
    expect(buildScheduleSlot(full)).toEqual({
      dayOfWeek: 2,
      timeStart: "19:00",
      timeEnd: "21:00",
    })
  })

  it("treats a day with no times as the whole day", () => {
    expect(buildScheduleSlot({ ...blank, scheduleDayOfWeek: "2" })).toEqual({
      dayOfWeek: 2,
      timeStart: "00:00",
      timeEnd: "23:59",
    })
  })

  it("defaults a missing end time to one hour after the start", () => {
    expect(buildScheduleSlot({ ...full, scheduleTimeEnd: "" })).toEqual({
      dayOfWeek: 2,
      timeStart: "19:00",
      timeEnd: "20:00",
    })
  })

  it("wraps past midnight when defaulting the end time", () => {
    expect(
      buildScheduleSlot({ scheduleDayOfWeek: "5", scheduleTimeStart: "23:30", scheduleTimeEnd: "" })
    ).toEqual({ dayOfWeek: 5, timeStart: "23:30", timeEnd: "00:30" })
  })

  it("keeps day '0' (Sunday) rather than reading it as absent", () => {
    expect(buildScheduleSlot({ ...full, scheduleDayOfWeek: "0" })?.dayOfWeek).toBe(0)
  })

  it("returns null for a blank schedule so the engine scores it as unknown", () => {
    expect(buildScheduleSlot(blank)).toBeNull()
  })

  it("returns null for times with no day — they can't constrain a meeting day", () => {
    expect(buildScheduleSlot({ ...full, scheduleDayOfWeek: "" })).toBeNull()
  })

  it("returns null for an inverted range", () => {
    expect(buildScheduleSlot({ ...full, scheduleTimeEnd: "18:00" })).toBeNull()
  })
})

/**
 * Meeting times are optional on the group side too, so stored records can hold a
 * day with no start time. The engine still has to score those groups instead of
 * silently dropping their schedule.
 */
describe("buildStoredScheduleSlot", () => {
  it("builds a slot from a complete stored schedule", () => {
    expect(buildStoredScheduleSlot(2, "19:00", "21:00")).toEqual({
      dayOfWeek: 2,
      timeStart: "19:00",
      timeEnd: "21:00",
    })
  })

  it("treats a stored day with no times as the whole day", () => {
    expect(buildStoredScheduleSlot(2, null, null)).toEqual({
      dayOfWeek: 2,
      timeStart: "00:00",
      timeEnd: "23:59",
    })
  })

  it("defaults a missing end time to one hour after the start", () => {
    expect(buildStoredScheduleSlot(2, "19:00", null)).toEqual({
      dayOfWeek: 2,
      timeStart: "19:00",
      timeEnd: "20:00",
    })
  })

  it("starts at midnight when only an end time is stored", () => {
    expect(buildStoredScheduleSlot(2, null, "21:00")).toEqual({
      dayOfWeek: 2,
      timeStart: "00:00",
      timeEnd: "21:00",
    })
  })

  it("keeps day 0 (Sunday) rather than reading it as absent", () => {
    expect(buildStoredScheduleSlot(0, null, null)?.dayOfWeek).toBe(0)
  })

  it("returns null without a day", () => {
    expect(buildStoredScheduleSlot(null, "19:00", "21:00")).toBeNull()
    expect(buildStoredScheduleSlot(undefined, null, null)).toBeNull()
  })

  it("agrees with the form-side builder for the same schedule", () => {
    expect(buildStoredScheduleSlot(2, null, null)).toEqual(
      buildScheduleSlot({ ...blank, scheduleDayOfWeek: "2" })
    )
  })
})
