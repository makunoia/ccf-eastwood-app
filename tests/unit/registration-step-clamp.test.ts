import { describe, it, expect } from "vitest"
import { clampFormStep } from "@/lib/forms/step-navigation"

/**
 * CCF-145 — the registration wizard derives its section list from config and from
 * answers given along the way, so it can shrink under the step the person is on.
 * `sections[formStep - 1].key` read unclamped throws during render.
 */
describe("clampFormStep", () => {
  it("leaves an in-range step alone", () => {
    expect(clampFormStep(2, 4)).toBe(2)
  })

  it("keeps the first and last steps addressable", () => {
    expect(clampFormStep(1, 4)).toBe(1)
    expect(clampFormStep(4, 4)).toBe(4)
  })

  it("pulls back to the last section when the list shrinks underneath", () => {
    // Confirming as a member who already has a DGroup drops the DGroup step while
    // the person is standing on step 3 of 4.
    expect(clampFormStep(4, 3)).toBe(3)
    expect(clampFormStep(7, 2)).toBe(2)
  })

  it("never returns a step below 1", () => {
    expect(clampFormStep(0, 3)).toBe(1)
    expect(clampFormStep(-5, 3)).toBe(1)
  })

  it("returns 1 for an empty section list rather than 0", () => {
    expect(clampFormStep(3, 0)).toBe(1)
    expect(clampFormStep(1, -1)).toBe(1)
  })

  it("rejects non-finite input instead of propagating NaN into an index", () => {
    expect(clampFormStep(NaN, 3)).toBe(1)
    expect(clampFormStep(Infinity, 3)).toBe(3)
  })

  it("produces a valid array index for every section count", () => {
    const sections = ["personal", "smallgroup", "breakout"]
    for (const step of [-1, 0, 1, 2, 3, 4, 99]) {
      expect(sections[clampFormStep(step, sections.length) - 1]).toBeDefined()
    }
  })
})
