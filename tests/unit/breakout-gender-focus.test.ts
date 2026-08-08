import { describe, it, expect } from "vitest"
import {
  deriveEffectiveGenderFocus,
  genderFocusAccepts,
} from "@/lib/breakouts/gender-focus"

describe("deriveEffectiveGenderFocus", () => {
  it("prefers an explicit focus over everything else", () => {
    expect(deriveEffectiveGenderFocus("Mixed", "Male", "Male", "Female")).toBe("Mixed")
    expect(deriveEffectiveGenderFocus("Female", "Male", null, null)).toBe("Female")
  })

  it("infers a single gender from the facilitators", () => {
    expect(deriveEffectiveGenderFocus(null, "Male", null, null)).toBe("Male")
    expect(deriveEffectiveGenderFocus(null, "Female", "Female", null)).toBe("Female")
  })

  it("infers Mixed when the two facilitators differ", () => {
    expect(deriveEffectiveGenderFocus(null, "Male", "Female", null)).toBe("Mixed")
  })

  it("falls back to the linked DGroup when no facilitator gender is known", () => {
    expect(deriveEffectiveGenderFocus(null, null, null, "Male")).toBe("Male")
    expect(deriveEffectiveGenderFocus(null, undefined, undefined, "Mixed")).toBe("Mixed")
  })

  it("returns null when there is nothing to infer from", () => {
    expect(deriveEffectiveGenderFocus(null, null, null, null)).toBeNull()
    expect(deriveEffectiveGenderFocus(null, undefined, undefined)).toBeNull()
  })

  // A facilitator's gender outranks the linked DGroup: the person actually
  // running the table is the better signal than a DGroup that only routes Catch
  // Mech requests.
  it("prefers facilitator gender over the linked DGroup's focus", () => {
    expect(deriveEffectiveGenderFocus(null, "Female", null, "Male")).toBe("Female")
  })
})

describe("genderFocusAccepts", () => {
  it("accepts everyone into an unfocused or Mixed group", () => {
    expect(genderFocusAccepts(null, "Male")).toBe(true)
    expect(genderFocusAccepts("Mixed", "Female")).toBe(true)
  })

  it("accepts a matching gender and rejects the other", () => {
    expect(genderFocusAccepts("Male", "Male")).toBe(true)
    expect(genderFocusAccepts("Male", "Female")).toBe(false)
  })

  // Missing data is not a mismatch — the picker would otherwise empty out for a
  // registrant the form never asked.
  it("accepts an unknown gender into any group", () => {
    expect(genderFocusAccepts("Male", null)).toBe(true)
    expect(genderFocusAccepts("Female", null)).toBe(true)
  })
})
