import { describe, expect, it } from "vitest"
import {
  buildDashboardPeriod,
  endOfUtcDay,
  normalizePeriod,
  occurrenceWindowWhere,
  startOfUtcDay,
} from "@/lib/events/dashboard-period"

/**
 * Occurrence dates are stored at UTC midnight, so the dashboard window has to be
 * snapped to UTC day boundaries or it silently drops whole sessions.
 */

// 06:00 in Manila (UTC+8) on 1 Aug 2026 — i.e. still 31 Jul in UTC.
const PH_EARLY_MORNING = new Date("2026-07-31T22:00:00.000Z")
const EVENT_START = new Date("2026-01-15T00:00:00.000Z")

describe("startOfUtcDay / endOfUtcDay", () => {
  it("snaps to the enclosing UTC day", () => {
    expect(startOfUtcDay(PH_EARLY_MORNING).toISOString()).toBe("2026-07-31T00:00:00.000Z")
    expect(endOfUtcDay(PH_EARLY_MORNING).toISOString()).toBe("2026-07-31T23:59:59.999Z")
  })

  it("does not mutate its argument", () => {
    const input = new Date(PH_EARLY_MORNING)
    startOfUtcDay(input)
    endOfUtcDay(input)
    expect(input.toISOString()).toBe(PH_EARLY_MORNING.toISOString())
  })
})

describe("normalizePeriod", () => {
  it("accepts the four supported windows", () => {
    for (const period of ["7d", "30d", "90d", "all"] as const) {
      expect(normalizePeriod(period)).toBe(period)
    }
  })

  it("falls back to 30d for missing or bogus input", () => {
    expect(normalizePeriod(undefined)).toBe("30d")
    expect(normalizePeriod("")).toBe("30d")
    expect(normalizePeriod("last-week")).toBe("30d")
  })
})

describe("buildDashboardPeriod", () => {
  it("ends at the end of today, not at the current instant", () => {
    const { end } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)
    expect(end.toISOString()).toBe("2026-07-31T23:59:59.999Z")
  })

  // Regression: a session dated today at 00:00Z used to be excluded until
  // 08:00 PH, hiding the session the check-in desk was actively working.
  it("includes a session dated today while it is still morning in Manila", () => {
    const { occurrenceRange } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)
    const todaysSession = new Date("2026-07-31T00:00:00.000Z")

    expect(todaysSession >= occurrenceRange.gte!).toBe(true)
    expect(todaysSession <= occurrenceRange.lte).toBe(true)
  })

  // Regression: the lower bound used to carry the current time-of-day, so the
  // oldest day in the range fell outside the window.
  it("includes the full oldest day of the range", () => {
    const { start, occurrenceRange } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)
    expect(start.toISOString()).toBe("2026-07-02T00:00:00.000Z")

    const oldestSession = new Date("2026-07-02T00:00:00.000Z")
    expect(oldestSession >= occurrenceRange.gte!).toBe(true)
  })

  it("sizes 7d / 30d / 90d windows from the start of today", () => {
    expect(buildDashboardPeriod("7d", EVENT_START, PH_EARLY_MORNING).start.toISOString()).toBe(
      "2026-07-25T00:00:00.000Z",
    )
    expect(buildDashboardPeriod("90d", EVENT_START, PH_EARLY_MORNING).start.toISOString()).toBe(
      "2026-05-03T00:00:00.000Z",
    )
  })

  // Regression: the window ran from `today - N` to the end of today, i.e. N+1
  // calendar days. On a weekly recurring event that let two sessions fall inside
  // "Last 7 days", doubling the session count and halving avg-per-session.
  it("spans exactly N calendar days, counting today as one of them", () => {
    const DAY_MS = 24 * 60 * 60 * 1000

    for (const [period, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const { start, end } = buildDashboardPeriod(period, EVENT_START, PH_EARLY_MORNING)
      expect(Math.round((end.getTime() + 1 - start.getTime()) / DAY_MS)).toBe(days)
    }
  })

  it("keeps last week's session out of a 7-day window on a weekly event", () => {
    const { occurrenceRange } = buildDashboardPeriod("7d", EVENT_START, PH_EARLY_MORNING)
    const thisWeek = new Date("2026-07-31T00:00:00.000Z")
    const lastWeek = new Date("2026-07-24T00:00:00.000Z")

    expect(thisWeek >= occurrenceRange.gte!).toBe(true)
    expect(lastWeek >= occurrenceRange.gte!).toBe(false)
  })

  it("excludes sessions that have not happened yet", () => {
    const { occurrenceRange } = buildDashboardPeriod("all", EVENT_START, PH_EARLY_MORNING)
    const tomorrowsSession = new Date("2026-08-01T00:00:00.000Z")
    expect(tomorrowsSession <= occurrenceRange.lte).toBe(false)
  })

  describe("all time", () => {
    it("drops the lower bound so a session predating the event start still counts", () => {
      const { occurrenceRange } = buildDashboardPeriod("all", EVENT_START, PH_EARLY_MORNING)
      expect(occurrenceRange.gte).toBeUndefined()
    })

    it("still reports the event start day as the window start", () => {
      const { start } = buildDashboardPeriod("all", EVENT_START, PH_EARLY_MORNING)
      expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z")
    })
  })
})

describe("occurrenceWindowWhere", () => {
  // Regression: the raw range alone hid any session dated past today, including
  // one whose check-in desk was opened early and already held check-ins. Those
  // people showed on the Sessions page while "Attendance by Session" was empty.
  // In PH this fires daily: a session dated with today's Manila date is a UTC
  // day ahead until 08:00 PH.
  it("readmits a future-dated session that already has check-ins", () => {
    const { occurrenceRange } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)
    const where = occurrenceWindowWhere(occurrenceRange)

    expect(where.OR).toHaveLength(2)
    expect(where.OR[0]).toEqual({ date: occurrenceRange })
    expect(where.OR[1]).toEqual({
      date: { gt: occurrenceRange.lte },
      attendees: { some: {} },
    })
  })

  it("keeps the attendance condition on the future branch only", () => {
    const { occurrenceRange } = buildDashboardPeriod("all", EVENT_START, PH_EARLY_MORNING)
    const where = occurrenceWindowWhere(occurrenceRange)

    // An empty session inside the window must still plot as a real zero.
    expect(where.OR[0]).not.toHaveProperty("attendees")
    // An empty session in the future must not plot at all.
    expect(where.OR[1]).toHaveProperty("attendees")
  })
})
