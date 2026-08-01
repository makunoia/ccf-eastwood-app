import { describe, it, expect } from "vitest"
import { buildTurnout, formatTurnoutRate } from "@/lib/events/turnout"

/**
 * CCF-91 — pre-registered vs actual check-in ratio on the event dashboard.
 */

describe("buildTurnout", () => {
  it("reports the checked-in share of registrants", () => {
    const turnout = buildTurnout(50, 40)

    expect(turnout.preRegistered).toBe(50)
    expect(turnout.checkedIn).toBe(40)
    expect(turnout.rate).toBeCloseTo(0.8)
    expect(turnout.noShows).toBe(10)
  })

  it("reports a full house as 100% with no no-shows", () => {
    const turnout = buildTurnout(12, 12)
    expect(turnout.rate).toBe(1)
    expect(turnout.noShows).toBe(0)
  })

  describe("edge cases", () => {
    it("has no rate when nobody registered", () => {
      const turnout = buildTurnout(0, 0)
      expect(turnout.rate).toBeNull()
      expect(turnout.noShows).toBe(0)
    })

    it("reports 0% when registrants exist but nobody checked in", () => {
      const turnout = buildTurnout(30, 0)
      expect(turnout.rate).toBe(0)
      expect(turnout.noShows).toBe(30)
    })

    it("counts every registrant as a no-show when the period has no attendance", () => {
      // A 7-day window on an event that ran months ago: the roster is intact,
      // the attendance in-window is not.
      const turnout = buildTurnout(62, 0)
      expect(turnout.noShows).toBe(62)
      expect(formatTurnoutRate(turnout.rate)).toBe("0%")
    })
  })
})

describe("formatTurnoutRate", () => {
  it("renders whole percents", () => {
    expect(formatTurnoutRate(0.8)).toBe("80%")
    expect(formatTurnoutRate(1)).toBe("100%")
    expect(formatTurnoutRate(0)).toBe("0%")
  })

  it("rounds to the nearest percent", () => {
    expect(formatTurnoutRate(buildTurnout(3, 2).rate)).toBe("67%")
    expect(formatTurnoutRate(buildTurnout(7, 1).rate)).toBe("14%")
  })

  it("renders an em dash when there is no rate", () => {
    expect(formatTurnoutRate(null)).toBe("—")
  })
})
