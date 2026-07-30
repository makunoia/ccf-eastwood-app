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
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "WalkIn")).toBe("no facilitators")
  })

  it("withholds a context-scoped message elsewhere", () => {
    // The public form offers every group regardless of staffing, so warning
    // about facilitators on the Register tab would simply be wrong.
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "Register")).toBeNull()
    expect(prerequisiteFor(walkInOnly, "sectionBreakout", "CheckIn")).toBeNull()
  })

  it("applies an unscoped message to every context", () => {
    for (const context of ["Register", "WalkIn", "CheckIn"] as const) {
      expect(prerequisiteFor(everywhere, "fieldLifeStage", context)).toBe("no life stages")
    }
  })

  it("returns null for toggles with no prerequisite", () => {
    expect(prerequisiteFor(everywhere, "sectionDietary", "Register")).toBeNull()
  })

  it("tolerates no prerequisites at all", () => {
    expect(prerequisiteFor(undefined, "sectionBreakout", "WalkIn")).toBeNull()
    expect(prerequisiteFor({}, "sectionBreakout", "WalkIn")).toBeNull()
  })
})
