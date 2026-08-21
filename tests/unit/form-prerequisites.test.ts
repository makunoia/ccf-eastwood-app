import { describe, it, expect } from "vitest"
import {
  prerequisiteFor,
  type TogglePrerequisites,
} from "@/lib/forms/form-prerequisites"

/**
 * The narrowing rule behind the builder's "Won't show" warnings. Getting this
 * wrong in either direction is its own bug: a warning on the wrong tab is
 * misinformation, a missing one puts us back where we started.
 */
describe("prerequisiteFor", () => {
  const walkInOnly: TogglePrerequisites = {
    sectionBreakout: { message: "no facilitators", contexts: ["WalkIn"] },
  }
  const everywhere: TogglePrerequisites = {
    fieldLifeStage: { message: "no life stages" },
  }

  it("returns the message on a listed context", () => {
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "WalkIn", true)).toBe("no facilitators")
  })

  it("withholds a context-scoped message elsewhere", () => {
    // The public form offers every group regardless of staffing, so warning
    // about facilitators on the Register tab would simply be wrong.
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "Register", true)).toBeNull()
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "CheckIn", true)).toBeNull()
  })

  it("applies an unscoped message to every context", () => {
    for (const context of ["Register", "WalkIn", "CheckIn"] as const) {
      expect(prerequisiteFor(everywhere, "fieldLifeStage", context, true)).toBe("no life stages")
    }
  })

  it("returns null for toggles with no prerequisite", () => {
    expect(prerequisiteFor(everywhere, "sectionDietary", "Register", true)).toBeNull()
  })

  it("tolerates no prerequisites at all", () => {
    expect(prerequisiteFor(undefined, "sectionBreakout", "WalkIn", true)).toBeNull()
    expect(prerequisiteFor({}, "sectionBreakout", "WalkIn", true)).toBeNull()
  })

  /**
   * The two states are mutually exclusive, and which one a warning belongs to is
   * the whole reason this argument exists. An ordinary prerequisite explains why
   * something switched *on* won't render; a `whenOff` one explains what switching
   * something *off* costs. Showing either in the wrong state is nonsense the
   * admin has no way to act on.
   */
  describe("on/off narrowing", () => {
    const whenOff: TogglePrerequisites = {
      fieldGender: { message: "matched on life stage instead", whenOff: true },
    }

    it("shows a whenOff message only while the toggle is off", () => {
      expect(prerequisiteFor(whenOff, "fieldGender", "Register", false)).toBe(
        "matched on life stage instead"
      )
      expect(prerequisiteFor(whenOff, "fieldGender", "Register", true)).toBeNull()
    })

    it("shows an ordinary message only while the toggle is on", () => {
      expect(prerequisiteFor(everywhere, "fieldLifeStage", "Register", true)).toBe("no life stages")
      expect(prerequisiteFor(everywhere, "fieldLifeStage", "Register", false)).toBeNull()
    })

    it("still respects contexts on a whenOff message", () => {
      const scoped: TogglePrerequisites = {
        fieldGender: { message: "door only", whenOff: true, contexts: ["WalkIn"] },
      }
      expect(prerequisiteFor(scoped, "fieldGender", "WalkIn", false)).toBe("door only")
      expect(prerequisiteFor(scoped, "fieldGender", "Register", false)).toBeNull()
    })
  })
})
