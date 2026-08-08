import { describe, it, expect } from "vitest"
import {
  suggestBreakoutGroup,
  breakoutPickerOptions,
  withoutOccupancy,
  type BreakoutCandidate,
} from "@/lib/breakout-suggestion"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tests still express capacity as the raw `memberCount` / `memberLimit` pair —
 * that's how a group is actually configured. The reduction to `isFull` /
 * `roomRatio` (which is what `BreakoutCandidate` now carries, so the numbers
 * needn't be shipped to a public registrant) happens here, exactly as the server
 * mapper does it.
 */
function makeGroup(
  overrides: Partial<Omit<BreakoutCandidate, "isFull" | "roomRatio" | "occupancy">> & {
    memberLimit?: number | null
    memberCount?: number
  } = {}
): BreakoutCandidate {
  const { memberLimit = null, memberCount = 0, ...rest } = overrides
  const occupancy = breakoutOccupancy({ memberCount, memberLimit })
  return {
    id: "g1",
    name: "Group",
    genderFocus: null,
    ageRangeMin: null,
    ageRangeMax: null,
    isFull: occupancy.isFull,
    roomRatio:
      memberLimit == null || memberLimit === 0 ? null : (occupancy.remaining as number) / memberLimit,
    occupancy: { memberCount, memberLimit },
    ...rest,
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
  describe("gender filtering", () => {
    // A men's breakout group is not something a woman can join, so listing it is
    // a dead end she can walk into.
    it("hides groups focused on the other gender", () => {
      const groups = [
        makeGroup({ id: "male-g", genderFocus: "Male" }),
        makeGroup({ id: "female-g", genderFocus: "Female" }),
      ]
      expect(breakoutPickerOptions(groups, { gender: "Female" }).map((g) => g.id)).toEqual([
        "female-g",
      ])
    })

    it("keeps Mixed and unset-focus groups for either gender", () => {
      const groups = [
        makeGroup({ id: "mixed-g", genderFocus: "Mixed" }),
        makeGroup({ id: "open-g", genderFocus: null }),
      ]
      expect(breakoutPickerOptions(groups, { gender: "Male" }).map((g) => g.id)).toEqual([
        "mixed-g",
        "open-g",
      ])
      expect(breakoutPickerOptions(groups, { gender: "Female" }).map((g) => g.id)).toEqual([
        "mixed-g",
        "open-g",
      ])
    })

    // The regression this pins: filtering on a *missing* gender made every
    // gendered group disappear for a registrant the form never asked, which
    // could empty the dropdown entirely.
    it("filters nothing when gender is unknown", () => {
      const groups = [
        makeGroup({ id: "male-g", genderFocus: "Male" }),
        makeGroup({ id: "female-g", genderFocus: "Female" }),
        makeGroup({ id: "mixed-g", genderFocus: "Mixed" }),
      ]
      expect(breakoutPickerOptions(groups, { gender: null }).map((g) => g.id)).toEqual([
        "male-g",
        "female-g",
        "mixed-g",
      ])
    })

    it("filters nothing when no profile is passed at all", () => {
      const groups = [
        makeGroup({ id: "male-g", genderFocus: "Male" }),
        makeGroup({ id: "female-g", genderFocus: "Female" }),
      ]
      expect(breakoutPickerOptions(groups).map((g) => g.id)).toEqual(["male-g", "female-g"])
    })

    it("can filter down to nothing when every group is for the other gender", () => {
      const groups = [makeGroup({ id: "male-g", genderFocus: "Male" })]
      expect(breakoutPickerOptions(groups, { gender: "Female" })).toEqual([])
    })
  })

  // Age and capacity stay surfaced rather than applied — they are soft, and a
  // registrant who answered an age bucket instead of a birth year would lose
  // every age-ranged group for no good reason.
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

// ─── withoutOccupancy ─────────────────────────────────────────────────────────

describe("withoutOccupancy", () => {
  // The public registration form renders this same picker. Occupancy is an
  // admin-facing operational number, and it used to sit in the public page's
  // payload — unrendered, but readable by anyone who opened devtools.
  it("drops the raw headcounts", () => {
    const stripped = withoutOccupancy([makeGroup({ memberLimit: 12, memberCount: 8 })])
    expect(stripped[0].occupancy).toBeNull()
  })

  it("leaves no headcount anywhere in the serialized payload", () => {
    const stripped = withoutOccupancy([
      makeGroup({ id: "a", name: "Alpha", memberLimit: 12, memberCount: 8 }),
      makeGroup({ id: "b", name: "Bravo", memberLimit: null, memberCount: 40 }),
    ])
    const json = JSON.stringify(stripped)
    expect(json).not.toContain("memberCount")
    expect(json).not.toContain("memberLimit")
    expect(json).not.toContain("40")
  })

  it("keeps fullness, which is a fact about the choice rather than an occupancy figure", () => {
    const [full, open] = withoutOccupancy([
      makeGroup({ id: "full", memberLimit: 5, memberCount: 5 }),
      makeGroup({ id: "open", memberLimit: 5, memberCount: 1 }),
    ])
    expect(full.isFull).toBe(true)
    expect(open.isFull).toBe(false)
  })

  it("still suggests the same group once the counts are gone", () => {
    const groups = [
      makeGroup({ id: "roomy", memberLimit: 10, memberCount: 1 }),
      makeGroup({ id: "tight", memberLimit: 10, memberCount: 9 }),
    ]
    const profile = { gender: null, birthYear: null }
    expect(suggestBreakoutGroup(withoutOccupancy(groups), profile)?.id).toBe(
      suggestBreakoutGroup(groups, profile)?.id
    )
  })

  it("still refuses to suggest a full group", () => {
    const stripped = withoutOccupancy([makeGroup({ memberLimit: 5, memberCount: 5 })])
    expect(suggestBreakoutGroup(stripped, { gender: null, birthYear: null })).toBeNull()
  })

  it("gives the picker no occupancy to render", () => {
    const [option] = breakoutPickerOptions(
      withoutOccupancy([makeGroup({ memberLimit: 12, memberCount: 8 })])
    )
    expect(option.occupancyView).toBeNull()
  })

  it("gives a staffed surface the occupancy to render", () => {
    const [option] = breakoutPickerOptions([makeGroup({ memberLimit: 12, memberCount: 8 })])
    expect(option.occupancyView?.label).toBe("8 / 12")
    expect(option.occupancyView?.remaining).toBe(4)
  })
})
