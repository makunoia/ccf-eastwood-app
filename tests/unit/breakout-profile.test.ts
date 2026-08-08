import { describe, it, expect } from "vitest"
import {
  isProfileEmpty,
  profileRows,
  formatAgeRange,
  missingTimothyFields,
  type BreakoutMatchingProfile,
} from "@/lib/breakouts/profile"

function profile(
  overrides: Partial<BreakoutMatchingProfile> = {}
): BreakoutMatchingProfile {
  return {
    lifeStages: [],
    genderFocus: null,
    language: [],
    ageRangeMin: null,
    ageRangeMax: null,
    ...overrides,
  }
}

describe("isProfileEmpty", () => {
  it("is empty when nothing is set", () => {
    expect(isProfileEmpty(profile())).toBe(true)
  })

  it.each([
    ["life stage", { lifeStages: [{ id: "ls1", name: "Young Pro" }] }],
    ["gender focus", { genderFocus: "Male" }],
    ["language", { language: ["English"] }],
    ["min age", { ageRangeMin: 25 }],
    ["max age", { ageRangeMax: 35 }],
  ])("is not empty once %s is set", (_label, overrides) => {
    expect(isProfileEmpty(profile(overrides as Partial<BreakoutMatchingProfile>))).toBe(false)
  })
})

describe("profileRows", () => {
  it("returns the four matching factors in a fixed order", () => {
    expect(profileRows(profile()).map((r) => r.key)).toEqual([
      "lifeStage",
      "gender",
      "language",
      "age",
    ])
  })

  // "Matches everyone" and "nobody filled this in" are different facts, and the
  // empty state already covers the second one for a wholly blank profile.
  it("shows unset factors as Any rather than dropping them", () => {
    expect(profileRows(profile()).map((r) => r.value)).toEqual(["Any", "Any", "Any", "Any"])
  })

  it("joins multiple life stages and languages", () => {
    const rows = profileRows(
      profile({
        lifeStages: [
          { id: "a", name: "Young Pro" },
          { id: "b", name: "Singles" },
        ],
        language: ["English", "Filipino"],
      })
    )
    expect(rows.find((r) => r.key === "lifeStage")?.value).toBe("Young Pro, Singles")
    expect(rows.find((r) => r.key === "language")?.value).toBe("English, Filipino")
  })

  it("labels the gender focus", () => {
    expect(profileRows(profile({ genderFocus: "Mixed" })).find((r) => r.key === "gender")?.value).toBe(
      "Mixed"
    )
  })

  // Meeting format, location and schedule were carried over from DGroups and
  // never meant anything for a table that meets once, during the event.
  it("no longer reports meeting format, location, schedule or capacity", () => {
    const labels = profileRows(profile()).map((r) => r.label)
    expect(labels).not.toContain("Meeting Format")
    expect(labels).not.toContain("Location")
    expect(labels).not.toContain("Schedule")
    expect(labels).not.toContain("Capacity")
  })
})

describe("formatAgeRange", () => {
  it("formats a closed range", () => {
    expect(formatAgeRange(25, 35)).toBe("25–35 yrs")
  })

  it("formats an open upper bound", () => {
    expect(formatAgeRange(25, null)).toBe("25+ yrs")
  })

  it("formats an open lower bound", () => {
    expect(formatAgeRange(null, 35)).toBe("Up to 35 yrs")
  })

  it("formats no range at all", () => {
    expect(formatAgeRange(null, null)).toBe("Any")
  })

  it("keeps a zero bound rather than treating it as unset", () => {
    expect(formatAgeRange(0, 12)).toBe("0–12 yrs")
  })
})

describe("missingTimothyFields", () => {
  const complete = {
    lifeStageIds: ["ls1"],
    genderFocus: "Male",
    language: ["English"],
    ageRangeMin: 25,
    ageRangeMax: 35,
  }

  it("accepts a complete profile", () => {
    expect(missingTimothyFields(complete)).toEqual([])
  })

  it("names every missing field, in form order", () => {
    expect(missingTimothyFields({})).toEqual([
      "Life Stage",
      "Gender Focus",
      "Language",
      "Age Range",
    ])
  })

  it.each([
    ["Life Stage", { lifeStageIds: [] }],
    ["Gender Focus", { genderFocus: "" }],
    ["Language", { language: [] }],
  ])("flags a missing %s", (label, override) => {
    expect(missingTimothyFields({ ...complete, ...override })).toEqual([label])
  })

  // A DGroup age range with one open end isn't a range, and this profile seeds
  // a real DGroup — so both bounds are required.
  it("requires both age bounds", () => {
    expect(missingTimothyFields({ ...complete, ageRangeMax: null })).toEqual(["Age Range"])
    expect(missingTimothyFields({ ...complete, ageRangeMin: null })).toEqual(["Age Range"])
  })

  // The drawers hold form values as strings; "" is unset, "0" is not.
  it("reads the drawers' string form values", () => {
    expect(missingTimothyFields({ ...complete, ageRangeMin: "", ageRangeMax: "" })).toEqual([
      "Age Range",
    ])
    expect(missingTimothyFields({ ...complete, ageRangeMin: "0", ageRangeMax: "12" })).toEqual([])
  })

  // Meeting Format and Meeting Schedule used to be required here; the fields no
  // longer exist on a breakout group, so requiring them was unsatisfiable.
  it("no longer requires meeting format or schedule", () => {
    expect(missingTimothyFields(complete)).not.toContain("Meeting Format")
    expect(missingTimothyFields(complete)).not.toContain("Meeting Schedule")
  })
})
