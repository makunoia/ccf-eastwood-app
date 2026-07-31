import { describe, it, expect } from "vitest"
import {
  suggestBreakoutGroup,
  breakoutPickerOptions,
  type BreakoutCandidate,
} from "@/lib/breakout-suggestion"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<BreakoutCandidate> = {}): BreakoutCandidate {
  return {
    id: "g1",
    name: "Group",
    genderFocus: null,
    ageRangeMin: null,
    ageRangeMax: null,
    memberLimit: null,
    memberCount: 0,
    ...overrides,
  }
}

const CURRENT_YEAR = new Date().getUTCFullYear()

// ─── suggestBreakoutGroup ─────────────────────────────────────────────────────

describe("suggestBreakoutGroup", () => {
  describe("gender filtering", () => {
    it("suggests a null-genderFocus group to a male participant", () => {
      const group = makeGroup({ genderFocus: null })
      const result = suggestBreakoutGroup([group], { gender: "Male", birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a null-genderFocus group to a female participant", () => {
      const group = makeGroup({ genderFocus: null })
      const result = suggestBreakoutGroup([group], { gender: "Female", birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a null-genderFocus group when participant gender is unknown", () => {
      const group = makeGroup({ genderFocus: null })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a Mixed group to a male participant", () => {
      const group = makeGroup({ genderFocus: "Mixed" })
      const result = suggestBreakoutGroup([group], { gender: "Male", birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a Mixed group to a female participant", () => {
      const group = makeGroup({ genderFocus: "Mixed" })
      const result = suggestBreakoutGroup([group], { gender: "Female", birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a Mixed group when participant gender is unknown", () => {
      const group = makeGroup({ genderFocus: "Mixed" })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      // Mixed is treated the same as null — eligible for everyone
      expect(result?.id).toBe("g1")
    })

    it("suggests a Male-focused group to a male participant", () => {
      const group = makeGroup({ genderFocus: "Male" })
      const result = suggestBreakoutGroup([group], { gender: "Male", birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("excludes a Male-focused group from a female participant", () => {
      const group = makeGroup({ genderFocus: "Male" })
      const result = suggestBreakoutGroup([group], { gender: "Female", birthYear: null })
      expect(result).toBeNull()
    })

    it("excludes a Female-focused group from a male participant", () => {
      const group = makeGroup({ genderFocus: "Female" })
      const result = suggestBreakoutGroup([group], { gender: "Male", birthYear: null })
      expect(result).toBeNull()
    })

    it("excludes a Female-focused group when participant gender is unknown", () => {
      // A participant who didn't select a gender cannot be placed in a gendered group
      const group = makeGroup({ genderFocus: "Female" })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result).toBeNull()
    })

    it("excludes a Male-focused group when participant gender is unknown", () => {
      const group = makeGroup({ genderFocus: "Male" })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result).toBeNull()
    })

    it("returns null when ALL groups are Female-focused and participant is Male", () => {
      // This is the scenario the admin hit: they set genderFocus on every group
      // but none are Male or Mixed
      const groups = [
        makeGroup({ id: "g1", genderFocus: "Female" }),
        makeGroup({ id: "g2", genderFocus: "Female" }),
        makeGroup({ id: "g3", genderFocus: "Female" }),
      ]
      const result = suggestBreakoutGroup(groups, { gender: "Male", birthYear: null })
      expect(result).toBeNull()
    })

    it("returns null when ALL groups are Female-focused and participant gender is unknown", () => {
      const groups = [
        makeGroup({ id: "g1", genderFocus: "Female" }),
        makeGroup({ id: "g2", genderFocus: "Female" }),
      ]
      const result = suggestBreakoutGroup(groups, { gender: null, birthYear: null })
      expect(result).toBeNull()
    })

    it("picks the Male group (not Female) when both exist and participant is Male", () => {
      const maleGroup = makeGroup({ id: "male", genderFocus: "Male" })
      const femaleGroup = makeGroup({ id: "female", genderFocus: "Female" })
      const result = suggestBreakoutGroup([maleGroup, femaleGroup], { gender: "Male", birthYear: null })
      expect(result?.id).toBe("male")
    })
  })

  describe("age filtering", () => {
    it("suggests a group with a matching age range", () => {
      const group = makeGroup({ ageRangeMin: 20, ageRangeMax: 30 })
      const birthYear = CURRENT_YEAR - 25
      const result = suggestBreakoutGroup([group], { gender: null, birthYear })
      expect(result?.id).toBe("g1")
    })

    it("excludes a group when participant is too young", () => {
      const group = makeGroup({ ageRangeMin: 30, ageRangeMax: 40 })
      const birthYear = CURRENT_YEAR - 20
      const result = suggestBreakoutGroup([group], { gender: null, birthYear })
      expect(result).toBeNull()
    })

    it("excludes a group when participant is too old", () => {
      const group = makeGroup({ ageRangeMin: 18, ageRangeMax: 25 })
      const birthYear = CURRENT_YEAR - 35
      const result = suggestBreakoutGroup([group], { gender: null, birthYear })
      expect(result).toBeNull()
    })

    it("excludes an age-restricted group when participant has no birth year", () => {
      const group = makeGroup({ ageRangeMin: 20, ageRangeMax: 30 })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result).toBeNull()
    })

    it("suggests a group with only a minimum age when participant is old enough", () => {
      const group = makeGroup({ ageRangeMin: 18, ageRangeMax: null })
      const birthYear = CURRENT_YEAR - 25
      const result = suggestBreakoutGroup([group], { gender: null, birthYear })
      expect(result?.id).toBe("g1")
    })

    it("suggests a group with only a maximum age when participant is young enough", () => {
      const group = makeGroup({ ageRangeMin: null, ageRangeMax: 35 })
      const birthYear = CURRENT_YEAR - 25
      const result = suggestBreakoutGroup([group], { gender: null, birthYear })
      expect(result?.id).toBe("g1")
    })
  })

  describe("capacity filtering", () => {
    it("excludes a full group from suggestions", () => {
      const group = makeGroup({ memberLimit: 10, memberCount: 10 })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result).toBeNull()
    })

    it("suggests a group that has one slot remaining", () => {
      const group = makeGroup({ memberLimit: 10, memberCount: 9 })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result?.id).toBe("g1")
    })

    it("suggests a group with no limit regardless of member count", () => {
      const group = makeGroup({ memberLimit: null, memberCount: 999 })
      const result = suggestBreakoutGroup([group], { gender: null, birthYear: null })
      expect(result?.id).toBe("g1")
    })
  })

  describe("scoring — prefers specific over generic", () => {
    it("prefers a gendered group over a null-genderFocus group for the same participant", () => {
      const specific = makeGroup({ id: "specific", genderFocus: "Male" })
      const generic = makeGroup({ id: "generic", genderFocus: null })
      const result = suggestBreakoutGroup([generic, specific], { gender: "Male", birthYear: null })
      expect(result?.id).toBe("specific")
    })

    it("prefers a group with an age range over one with no age range", () => {
      const withAge = makeGroup({ id: "withAge", ageRangeMin: 20, ageRangeMax: 35 })
      const withoutAge = makeGroup({ id: "withoutAge", ageRangeMin: null, ageRangeMax: null })
      const birthYear = CURRENT_YEAR - 25
      const result = suggestBreakoutGroup([withoutAge, withAge], { gender: null, birthYear })
      expect(result?.id).toBe("withAge")
    })

    it("returns the only eligible group even if it is generic", () => {
      const groups = [
        makeGroup({ id: "open", genderFocus: null }),
        makeGroup({ id: "female", genderFocus: "Female" }),
      ]
      const result = suggestBreakoutGroup(groups, { gender: "Male", birthYear: null })
      expect(result?.id).toBe("open")
    })
  })

  describe("empty / edge cases", () => {
    it("returns null when no groups are provided", () => {
      expect(suggestBreakoutGroup([], { gender: "Male", birthYear: null })).toBeNull()
    })

    it("returns null when no group passes all filters", () => {
      const groups = [
        makeGroup({ id: "g1", genderFocus: "Female", memberLimit: 5, memberCount: 5 }),
        makeGroup({ id: "g2", genderFocus: "Male", ageRangeMin: 30 }),
      ]
      // Female participant, age 20 → g1 is full, g2 is wrong gender
      const result = suggestBreakoutGroup(groups, {
        gender: "Female",
        birthYear: CURRENT_YEAR - 20,
      })
      expect(result).toBeNull()
    })
  })
})

// ─── breakoutPickerOptions ────────────────────────────────────────────────────

describe("breakoutPickerOptions", () => {
  // The regression this pins: the browse list used to filter by gender and age,
  // so a registrant with neither recorded — because the form never asked, or
  // because they answered an age bucket instead of a birth year — saw every
  // gendered and age-ranged group disappear from the dropdown.
  it("keeps gendered groups regardless of the registrant's gender", () => {
    const groups = [
      makeGroup({ id: "male-g", genderFocus: "Male" }),
      makeGroup({ id: "female-g", genderFocus: "Female" }),
      makeGroup({ id: "mixed-g", genderFocus: "Mixed" }),
      makeGroup({ id: "open-g", genderFocus: null }),
    ]
    expect(breakoutPickerOptions(groups).map((g) => g.id)).toEqual([
      "male-g",
      "female-g",
      "mixed-g",
      "open-g",
    ])
  })

  it("keeps age-restricted groups when the registrant has no birth year", () => {
    const groups = [
      makeGroup({ id: "ranged", ageRangeMin: 20, ageRangeMax: 30 }),
      makeGroup({ id: "open", ageRangeMin: null, ageRangeMax: null }),
    ]
    expect(breakoutPickerOptions(groups).map((g) => g.id)).toEqual(["ranged", "open"])
  })

  it("keeps a group whose age range excludes the registrant outright", () => {
    const groups = [makeGroup({ id: "seniors", ageRangeMin: 60, ageRangeMax: 80 })]
    expect(breakoutPickerOptions(groups)).toHaveLength(1)
  })

  it("preserves the order it was given", () => {
    const groups = [
      makeGroup({ id: "c" }),
      makeGroup({ id: "a" }),
      makeGroup({ id: "b" }),
    ]
    expect(breakoutPickerOptions(groups).map((g) => g.id)).toEqual(["c", "a", "b"])
  })

  it("marks a group at its member limit as full without removing it", () => {
    const [option] = breakoutPickerOptions([
      makeGroup({ id: "full", memberLimit: 5, memberCount: 5 }),
    ])
    expect(option.id).toBe("full")
    expect(option.isFull).toBe(true)
  })

  it("marks an over-subscribed group as full", () => {
    const [option] = breakoutPickerOptions([makeGroup({ memberLimit: 5, memberCount: 6 })])
    expect(option.isFull).toBe(true)
  })

  it("never marks a group with no member limit as full", () => {
    const [option] = breakoutPickerOptions([makeGroup({ memberLimit: null, memberCount: 99 })])
    expect(option.isFull).toBe(false)
  })

  it("returns an empty list when the event has no groups", () => {
    expect(breakoutPickerOptions([])).toEqual([])
  })
})
