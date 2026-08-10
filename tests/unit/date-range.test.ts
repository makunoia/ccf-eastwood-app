import { describe, expect, it } from "vitest"

import { formatDate, formatDateRange } from "@/lib/format/date-range"

describe("formatDate", () => {
  it("formats a UTC-midnight date without shifting the day", () => {
    expect(formatDate("2026-08-09T00:00:00.000Z")).toBe("Aug 9, 2026")
  })
})

describe("formatDateRange", () => {
  it("collapses a same-day range to a single date (OneTime event)", () => {
    expect(
      formatDateRange("2026-08-09T00:00:00.000Z", "2026-08-09T00:00:00.000Z")
    ).toBe("Aug 9, 2026")
  })

  it("treats the same UTC day as one date even when the times differ", () => {
    expect(
      formatDateRange("2026-08-09T00:00:00.000Z", "2026-08-09T23:59:59.000Z")
    ).toBe("Aug 9, 2026")
  })

  it("shows a range for a multi-day span within one year", () => {
    expect(
      formatDateRange("2026-08-09T00:00:00.000Z", "2026-08-11T00:00:00.000Z")
    ).toBe("Aug 9 – Aug 11, 2026")
  })

  it("repeats the year when the span crosses new year", () => {
    expect(
      formatDateRange("2026-12-30T00:00:00.000Z", "2027-01-02T00:00:00.000Z")
    ).toBe("Dec 30, 2026 – Jan 2, 2027")
  })

  it("still collapses a same-day span near the UTC/Manila boundary", () => {
    // 16:00Z is already the next day in Manila; formatting must stay in UTC.
    expect(
      formatDateRange("2026-08-09T16:00:00.000Z", "2026-08-09T16:00:00.000Z")
    ).toBe("Aug 9, 2026")
  })
})
