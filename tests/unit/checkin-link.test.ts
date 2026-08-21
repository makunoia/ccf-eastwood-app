import { describe, expect, it } from "vitest"

import { isCheckinLive, utcDayOf, utcToday } from "@/lib/events/checkin-link"

/**
 * The rule the kiosk's date gate and the Sessions list's "Check-in page" button
 * both read. They disagreed before: the gate refused every visitor to a past,
 * closed session while the list still offered a button to it.
 */
describe("isCheckinLive", () => {
  const today = "2026-08-22"

  it("admits an open session whatever its date", () => {
    expect(
      isCheckinLive({ isOpen: true, date: "2026-08-15T00:00:00.000Z", today }),
    ).toBe(true)
  })

  it("admits today's session even while check-in is closed", () => {
    expect(
      isCheckinLive({ isOpen: false, date: "2026-08-22T00:00:00.000Z", today }),
    ).toBe(true)
  })

  it("refuses a past session that is closed", () => {
    expect(
      isCheckinLive({ isOpen: false, date: "2026-08-15T00:00:00.000Z", today }),
    ).toBe(false)
  })

  it("refuses a future session that is closed", () => {
    expect(
      isCheckinLive({ isOpen: false, date: "2026-08-29T00:00:00.000Z", today }),
    ).toBe(false)
  })

  it("takes a Date as readily as an ISO string", () => {
    expect(
      isCheckinLive({ isOpen: false, date: new Date("2026-08-22T00:00:00.000Z"), today }),
    ).toBe(true)
  })
})

/**
 * Occurrence dates are stored at UTC midnight, so the day key is read in UTC.
 * Reading it in Manila time would shift every session onto the day before and
 * hand today's kiosk link to yesterday's row.
 */
describe("utcDayOf", () => {
  it("reads the stored UTC day, not a local one", () => {
    expect(utcDayOf("2026-08-22T00:00:00.000Z")).toBe("2026-08-22")
  })

  it("keeps a late-UTC timestamp on its own day", () => {
    expect(utcDayOf("2026-08-22T23:59:59.000Z")).toBe("2026-08-22")
  })

  it("rolls to the next day at the UTC boundary", () => {
    expect(utcDayOf("2026-08-23T00:00:00.000Z")).toBe("2026-08-23")
  })
})

describe("utcToday", () => {
  it("takes an injected clock so callers can be deterministic", () => {
    expect(utcToday(new Date("2026-08-22T16:00:00.000Z"))).toBe("2026-08-22")
  })

  it("returns a bare day key", () => {
    expect(utcToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
