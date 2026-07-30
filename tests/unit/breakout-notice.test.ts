import { describe, it, expect } from "vitest"
import { resolveBreakoutNotice } from "@/lib/breakout-suggestion"

/**
 * Pins the decision that keeps the Breakout step on screen when it has nothing
 * to offer. The bug this replaces: an admin switched Breakout on for Walk-in,
 * the facilitator gate held every group back, and the step silently vanished —
 * with no signal on the form or in the builder.
 */
describe("resolveBreakoutNotice", () => {
  it("explains an empty list when groups exist but are all gated", () => {
    expect(
      resolveBreakoutNotice({ offerPicker: true, candidateCount: 0, totalGroups: 3 })
    ).toBe("awaiting-facilitator")
  })

  it("stays silent when the event has no breakout groups at all", () => {
    // Nothing anyone at a kiosk can do about it — a notice would be noise.
    expect(
      resolveBreakoutNotice({ offerPicker: true, candidateCount: 0, totalGroups: 0 })
    ).toBeNull()
  })

  it("stays silent when there are groups to choose from", () => {
    expect(
      resolveBreakoutNotice({ offerPicker: true, candidateCount: 2, totalGroups: 3 })
    ).toBeNull()
  })

  it("stays silent when the picker isn't offered at all", () => {
    // Section off, or auto-assign on — the step isn't expected, so it isn't missing.
    expect(
      resolveBreakoutNotice({ offerPicker: false, candidateCount: 0, totalGroups: 3 })
    ).toBeNull()
  })

  it("stays silent when the picker is off even with candidates loaded", () => {
    expect(
      resolveBreakoutNotice({ offerPicker: false, candidateCount: 5, totalGroups: 5 })
    ).toBeNull()
  })
})
