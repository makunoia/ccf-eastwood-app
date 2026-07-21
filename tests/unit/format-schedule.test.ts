import { describe, it, expect } from "vitest"
import { formatDayOfWeek, formatTime, formatSchedule } from "@/lib/format/schedule"

describe("formatDayOfWeek", () => {
  it("formats long, short and plural styles", () => {
    expect(formatDayOfWeek(0)).toBe("Sunday")
    expect(formatDayOfWeek(0, "long")).toBe("Sunday")
    expect(formatDayOfWeek(0, "short")).toBe("Sun")
    expect(formatDayOfWeek(0, "plural")).toBe("Sundays")
    expect(formatDayOfWeek(6, "short")).toBe("Sat")
  })

  it("returns empty string for an out-of-range or non-integer day", () => {
    expect(formatDayOfWeek(-1)).toBe("")
    expect(formatDayOfWeek(7)).toBe("")
    expect(formatDayOfWeek(1.5)).toBe("")
  })
})

describe("formatTime", () => {
  it("formats 12-hour time with am/pm", () => {
    expect(formatTime("09:00")).toBe("9:00 AM")
    expect(formatTime("19:30")).toBe("7:30 PM")
  })

  it("handles midnight and noon at the 12-hour boundary", () => {
    expect(formatTime("00:00")).toBe("12:00 AM")
    expect(formatTime("12:00")).toBe("12:00 PM")
    expect(formatTime("00:30")).toBe("12:30 AM")
    expect(formatTime("12:45")).toBe("12:45 PM")
  })

  it("returns empty string for missing or malformed input", () => {
    expect(formatTime(null)).toBe("")
    expect(formatTime(undefined)).toBe("")
    expect(formatTime("")).toBe("")
    expect(formatTime("not-a-time")).toBe("")
  })
})

describe("formatSchedule", () => {
  it("joins day and time window with an en dash", () => {
    expect(formatSchedule(2, "19:00", "21:00")).toBe("Tuesday · 7:00 PM – 9:00 PM")
  })

  it("shows only the start time when there is no end", () => {
    expect(formatSchedule(0, "09:00")).toBe("Sunday · 9:00 AM")
    expect(formatSchedule(0, "09:00", null)).toBe("Sunday · 9:00 AM")
  })

  it("respects the day style", () => {
    expect(formatSchedule(0, "09:00", "10:00", "plural")).toBe("Sundays · 9:00 AM – 10:00 AM")
  })

  it("falls back gracefully when data is partial", () => {
    // Out-of-range day → empty
    expect(formatSchedule(9, "09:00", "10:00")).toBe("")
    // Missing start time → day only
    expect(formatSchedule(1, null)).toBe("Monday")
  })
})
