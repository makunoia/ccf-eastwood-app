import { describe, expect, it } from "vitest"

import {
  formatAttendanceCount,
  formatAverageAttendance,
  formatSessionCount,
} from "@/lib/format/occurrence"

describe("formatSessionCount", () => {
  it("uses the singular noun for exactly one session", () => {
    expect(formatSessionCount(1)).toBe("1 session")
  })

  it("pluralises for zero and many", () => {
    expect(formatSessionCount(0)).toBe("0 sessions")
    expect(formatSessionCount(4)).toBe("4 sessions")
  })
})

describe("formatAttendanceCount", () => {
  it("names the empty state instead of rendering a bare zero", () => {
    expect(formatAttendanceCount(0)).toBe("No one checked in yet")
  })

  it("agrees with the count", () => {
    expect(formatAttendanceCount(1)).toBe("1 person checked in")
    expect(formatAttendanceCount(12)).toBe("12 people checked in")
  })
})

describe("formatAverageAttendance", () => {
  it("drops the decimal on whole averages", () => {
    expect(formatAverageAttendance(1)).toBe("Avg 1/session")
    expect(formatAverageAttendance(0)).toBe("Avg 0/session")
  })

  it("keeps a single decimal place on fractional averages", () => {
    expect(formatAverageAttendance(2.5)).toBe("Avg 2.5/session")
    expect(formatAverageAttendance(3.333333)).toBe("Avg 3.3/session")
  })
})
