import { describe, it, expect } from "vitest"
import {
  buildWeeklyBuckets,
  startOfISOWeek,
} from "@/app/(event)/event/[id]/catch-mech/weekly-buckets"

/**
 * The Catch Mech dashboard used to bucket confirmations by a DISPLAY string
 * ("Wk 29 · Jul 13") and sort with localeCompare. That sorts "Wk 10" before "Wk 9",
 * so the trailing slice kept the lexically-last weeks rather than the most recent
 * ones, and week numbers restarting at 1 broke ordering across a year boundary.
 * Buckets are now keyed on the week's Monday (YYYY-MM-DD), which sorts correctly.
 */

describe("startOfISOWeek", () => {
  it("snaps every day of a week back to its Monday", () => {
    // Mon 2026-07-13 .. Sun 2026-07-19 all belong to the week of Mon 2026-07-13.
    for (let day = 13; day <= 19; day++) {
      const d = new Date(2026, 6, day, 15, 30) // mid-afternoon, to catch tz slips
      expect(startOfISOWeek(d).getDate()).toBe(13)
      expect(startOfISOWeek(d).getMonth()).toBe(6)
    }
  })

  it("treats Sunday as the end of the week, not the start", () => {
    const sunday = new Date(2026, 6, 19)
    expect(startOfISOWeek(sunday).getDate()).toBe(13)
  })

  it("returns local midnight (not a UTC-shifted date)", () => {
    // toISOString() on a local-midnight Monday would roll back a day in UTC+8.
    const monday = startOfISOWeek(new Date(2026, 6, 15))
    expect(monday.getHours()).toBe(0)
    expect(monday.getMinutes()).toBe(0)
  })
})

describe("buildWeeklyBuckets", () => {
  it("orders weeks chronologically across the single→double digit boundary", () => {
    // Weeks 9 and 10 of 2026 — the exact pair the old localeCompare sort inverted.
    const now = new Date(2026, 2, 9) // Mon, ISO week 11
    const buckets = buildWeeklyBuckets(
      [new Date(2026, 1, 23), new Date(2026, 2, 2)], // wk 9, wk 10
      now,
      4
    )

    const keys = buckets.map((b) => b.weekStart)
    expect(keys).toEqual([...keys].sort())

    const wk9 = buckets.findIndex((b) => b.weekStart === "2026-02-23")
    const wk10 = buckets.findIndex((b) => b.weekStart === "2026-03-02")
    expect(wk9).toBeGreaterThanOrEqual(0)
    expect(wk10).toBeGreaterThan(wk9) // week 9 must sit LEFT of week 10
  })

  it("orders correctly across a year boundary", () => {
    // Late Dec 2025 (wk ~52) → early Jan 2026 (wk 1): week numbers restart, dates don't.
    const now = new Date(2026, 0, 12)
    const buckets = buildWeeklyBuckets(
      [new Date(2025, 11, 22), new Date(2026, 0, 5)],
      now,
      5
    )

    const keys = buckets.map((b) => b.weekStart)
    expect(keys).toEqual([...keys].sort())

    const dec = buckets.findIndex((b) => b.weekStart === "2025-12-22")
    const jan = buckets.findIndex((b) => b.weekStart === "2026-01-05")
    expect(dec).toBeGreaterThanOrEqual(0)
    expect(jan).toBeGreaterThan(dec)
  })

  it("pre-seeds the window with zeros so quiet weeks stay visible", () => {
    const now = new Date(2026, 6, 15)
    const buckets = buildWeeklyBuckets([new Date(2026, 6, 14)], now, 8)

    expect(buckets).toHaveLength(8)
    expect(buckets.filter((b) => b.count === 0)).toHaveLength(7)
    expect(buckets[buckets.length - 1].count).toBe(1) // current week
  })

  it("keeps the most recent N weeks, ending at the week containing `now`", () => {
    const now = new Date(2026, 6, 15) // week of Mon Jul 13
    const buckets = buildWeeklyBuckets([], now, 3)

    expect(buckets.map((b) => b.weekStart)).toEqual([
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
    ])
  })

  it("counts several confirmations landing in the same week", () => {
    const now = new Date(2026, 6, 15)
    const buckets = buildWeeklyBuckets(
      [new Date(2026, 6, 13), new Date(2026, 6, 15), new Date(2026, 6, 19)],
      now,
      4
    )
    expect(buckets[buckets.length - 1].count).toBe(3)
  })

  it("ignores dates outside the window rather than widening it", () => {
    const now = new Date(2026, 6, 15)
    const buckets = buildWeeklyBuckets([new Date(2025, 0, 1)], now, 8)

    expect(buckets).toHaveLength(8)
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(0)
  })

  it("returns an all-zero window when there is nothing to plot", () => {
    const buckets = buildWeeklyBuckets([], new Date(2026, 6, 15), 8)
    expect(buckets).toHaveLength(8)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })
})
