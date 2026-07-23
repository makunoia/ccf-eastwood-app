import { describe, it, expect } from "vitest"
import { DECLINE_REASON_LABELS } from "@/lib/decline-reason"
import { getEntityLabel } from "@/lib/import/field-definitions"
import { FORM_REGISTRY } from "@/lib/forms/registry"

/**
 * Regression guard for the "Small Group" → "DGroup" terminology change.
 * These pin the user-facing copy so the label can't silently revert while the
 * backend identifiers (Prisma models, enum keys, FeatureArea values, routes)
 * stay "SmallGroup". If a churchie ever renames the term again, update here.
 */
describe("DGroup terminology (user-facing labels)", () => {
  it("decline-reason label reads DGroup, keyed by the unchanged enum key", () => {
    // key is the Prisma enum value (unchanged); only the display string changed
    expect(DECLINE_REASON_LABELS.AlreadyInSmallGroup).toBe("Already part of a DGroup")
  })

  it("import entity label reads DGroups", () => {
    // the entity slug "small-group" is an identifier (unchanged); label is copy
    expect(getEntityLabel("small-group")).toBe("DGroups")
  })

  it("public join + confirmation form labels read DGroup", () => {
    expect(FORM_REGISTRY.JoinSmallGroup.label).toBe("Join a DGroup")
    expect(FORM_REGISTRY.SmallGroupConfirmation.label).toBe("DGroup Confirmation")
  })

  it("no user-facing label map still says 'Small Group'", () => {
    const allLabels = [
      ...Object.values(DECLINE_REASON_LABELS),
      getEntityLabel("small-group"),
      ...Object.values(FORM_REGISTRY).map((f) => f.label),
      ...Object.values(FORM_REGISTRY).map((f) => f.description),
    ]
    for (const label of allLabels) {
      expect(label).not.toMatch(/small group/i)
    }
  })
})
