/**
 * CCF-141 — the shared breakout capacity helper.
 *
 * Before this existed the same `memberCount >= memberLimit` expression lived in
 * six components and disagreed at the edges. The cases here are the edges: an
 * uncapped group, a group whose cap is zero, and a group that is already past
 * its cap. Each of those produced a wrong number somewhere in the old code.
 */

import { describe, it, expect } from "vitest"
import { breakoutOccupancy, compareByRoom } from "@/lib/breakouts/occupancy"

describe("breakoutOccupancy", () => {
  it("reports room on a group with space", () => {
    const o = breakoutOccupancy({ memberCount: 8, memberLimit: 12 })
    expect(o).toMatchObject({ remaining: 4, isFull: false, isOver: false, label: "8 / 12" })
    expect(o.fillRatio).toBeCloseTo(8 / 12)
  })

  it("is empty at zero members", () => {
    const o = breakoutOccupancy({ memberCount: 0, memberLimit: 12 })
    expect(o).toMatchObject({ remaining: 12, isFull: false, fillRatio: 0, label: "0 / 12" })
  })

  it("is full exactly at the limit, not past it", () => {
    const o = breakoutOccupancy({ memberCount: 8, memberLimit: 8 })
    expect(o).toMatchObject({ remaining: 0, isFull: true, isOver: false, fillRatio: 1 })
  })

  it("clamps an over-capacity group instead of reporting negative room", () => {
    const o = breakoutOccupancy({ memberCount: 9, memberLimit: 8 })
    expect(o.isFull).toBe(true)
    expect(o.isOver).toBe(true)
    expect(o.remaining).toBe(0)
    expect(o.fillRatio).toBe(1)
  })

  // The regression the ticket names explicitly: a null limit must never render
  // as "0 remaining", and must never reach a division.
  describe("an uncapped group", () => {
    it("has no remaining rather than zero remaining", () => {
      const o = breakoutOccupancy({ memberCount: 40, memberLimit: null })
      expect(o.remaining).toBeNull()
      expect(o.remaining).not.toBe(0)
    })

    it("is never full, however many members it holds", () => {
      expect(breakoutOccupancy({ memberCount: 0, memberLimit: null }).isFull).toBe(false)
      expect(breakoutOccupancy({ memberCount: 999, memberLimit: null }).isFull).toBe(false)
      expect(breakoutOccupancy({ memberCount: 999, memberLimit: null }).isOver).toBe(false)
    })

    it("has no fill ratio to divide for", () => {
      expect(breakoutOccupancy({ memberCount: 7, memberLimit: null }).fillRatio).toBeNull()
    })

    it("labels the bare count with no slash", () => {
      expect(breakoutOccupancy({ memberCount: 7, memberLimit: null }).label).toBe("7")
    })
  })

  it("survives a zero limit without dividing by zero", () => {
    const o = breakoutOccupancy({ memberCount: 0, memberLimit: 0 })
    expect(Number.isFinite(o.fillRatio)).toBe(true)
    expect(o.fillRatio).toBe(1)
    expect(o.isFull).toBe(true)
    expect(o.remaining).toBe(0)

    const over = breakoutOccupancy({ memberCount: 3, memberLimit: 0 })
    expect(Number.isNaN(over.fillRatio as number)).toBe(false)
    expect(over.isOver).toBe(true)
  })

  it("keeps fillRatio inside 0..1 for every input", () => {
    const inputs = [
      { memberCount: 0, memberLimit: 5 },
      { memberCount: 5, memberLimit: 5 },
      { memberCount: 50, memberLimit: 5 },
      { memberCount: 0, memberLimit: 0 },
    ]
    for (const input of inputs) {
      const ratio = breakoutOccupancy(input).fillRatio
      expect(ratio).not.toBeNull()
      expect(ratio as number).toBeGreaterThanOrEqual(0)
      expect(ratio as number).toBeLessThanOrEqual(1)
    }
  })
})

describe("compareByRoom", () => {
  const o = (memberCount: number, memberLimit: number | null) =>
    breakoutOccupancy({ memberCount, memberLimit })

  it("puts the group with the most open slots first", () => {
    const sorted = [o(8, 12), o(2, 12), o(11, 12)].sort(compareByRoom)
    expect(sorted.map((x) => x.remaining)).toEqual([10, 4, 1])
  })

  it("ranks an uncapped group above every capped one", () => {
    const sorted = [o(1, 100), o(500, null), o(0, 12)].sort(compareByRoom)
    expect(sorted[0].memberLimit).toBeNull()
  })

  it("sinks a full group to the bottom", () => {
    const sorted = [o(8, 8), o(1, 8)].sort(compareByRoom)
    expect(sorted[0].isFull).toBe(false)
    expect(sorted[1].isFull).toBe(true)
  })
})
