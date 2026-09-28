import { describe, it, expect } from "vitest"
import {
  deriveEffectiveGenderFocus,
  genderFocusAccepts,
} from "@/lib/breakouts/gender-focus"

describe("deriveEffectiveGenderFocus", () => {
  it("uses only the breakout group's explicit focus", () => {
    expect(deriveEffectiveGenderFocus("Male")).toBe("Male")
    expect(deriveEffectiveGenderFocus("Mixed")).toBe("Mixed")
    expect(deriveEffectiveGenderFocus(null)).toBeNull()
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
