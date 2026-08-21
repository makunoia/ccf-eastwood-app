import { describe, it, expect } from "vitest"
import { resolveFillLevels } from "@/lib/breakout-suggestion-server"

/**
 * The scale that lets the breakout picker order capped and uncapped groups
 * against each other.
 *
 * It exists because `roomRatio` — the figure it replaced — was `null` for any
 * group without a `memberLimit`. A day whose tables are created without limits
 * is the ordinary case rather than the exception, so every group scored the
 * same, the sort was stable, and the first table created absorbed every single
 * registrant. These tests pin the three regimes: all capped, all uncapped, and
 * the mixture.
 */

const rows = (...pairs: [number, number | null][]) =>
  pairs.map(([memberCount, memberLimit]) => ({ memberCount, memberLimit }))

describe("resolveFillLevels", () => {
  describe("capped groups", () => {
    it("uses each group's own fill ratio", () => {
      expect(resolveFillLevels(rows([5, 10], [2, 10], [10, 10]))).toEqual([0.5, 0.2, 1])
    })

    it("makes a big table absorb proportionally more than a small one", () => {
      // 4/20 is emptier than 2/5, even though it holds twice as many people —
      // this is the whole reason the scale is a ratio and not a headcount.
      const [big, small] = resolveFillLevels(rows([4, 20], [2, 5]))
      expect(big).toBeLessThan(small)
    })

    it("reports an empty set of capped groups as all-zero", () => {
      expect(resolveFillLevels(rows([0, 8], [0, 12]))).toEqual([0, 0])
    })
  })

  describe("uncapped groups", () => {
    // The collab-day shape: tables created without limits. Raw headcount is
    // exactly the right comparison here, because every table is the same
    // notional size.
    it("orders by headcount, normalised against the fullest", () => {
      expect(resolveFillLevels(rows([0, null], [3, null], [6, null]))).toEqual([0, 0.5, 1])
    })

    it("reports every group as zero when nobody has been placed yet", () => {
      expect(resolveFillLevels(rows([0, null], [0, null]))).toEqual([0, 0])
    })

    it("separates groups that a null roomRatio used to tie", () => {
      const [a, b] = resolveFillLevels(rows([1, null], [7, null]))
      expect(a).toBeLessThan(b)
    })
  })

  describe("a mixture", () => {
    it("measures an uncapped group against the mean cap of the capped ones", () => {
      // Caps are 10 and 20, mean 15 — so the uncapped group holding 3 reads as
      // 3/15, emptier than the 5/10 capped one beside it.
      const [capped, other, uncapped] = resolveFillLevels(rows([5, 10], [10, 20], [3, null]))
      expect(capped).toBe(0.5)
      expect(other).toBe(0.5)
      expect(uncapped).toBeCloseTo(0.2)
      expect(uncapped).toBeLessThan(capped)
    })

    it("caps an overflowing uncapped group at 1 rather than letting it run away", () => {
      // Without the clamp a wildly oversubscribed uncapped group would produce a
      // number far above any capped group's, which says nothing more useful than
      // "fullest" and makes the scale hard to reason about.
      const [, uncapped] = resolveFillLevels(rows([0, 4], [99, null]))
      expect(uncapped).toBe(1)
    })
  })

  it("returns nothing for no groups", () => {
    expect(resolveFillLevels([])).toEqual([])
  })

  it("treats a zero member limit as uncapped rather than dividing by it", () => {
    const [zeroLimit] = resolveFillLevels(rows([2, 0]))
    expect(Number.isFinite(zeroLimit)).toBe(true)
  })
})
