import { describe, it, expect } from "vitest"
import {
  ageFromBirth,
  bucketOverlapsRange,
  normalizeCity,
  cityOptions,
  languageOptions,
  filterBreakoutCandidates,
  visibleFilters,
  criteriaToFilters,
  sortCandidates,
  activeFilterCount,
  hasAttributeFilters,
  CANDIDATE_FILTER_KEYS,
  type BreakoutCandidate,
  type CandidateDemographics,
  type BreakoutCriteria,
} from "@/lib/breakouts/candidate-filters"
import {
  BARE_EVENT_FORM_CONFIG,
  type EventFormConfigData,
} from "@/lib/forms/context-config"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EMPTY_DEMOGRAPHICS: CandidateDemographics = {
  lifeStageId: null,
  gender: null,
  language: [],
  birthMonth: null,
  birthYear: null,
  ageRangeBucket: null,
  workCity: null,
  meetingPreference: null,
  scheduleSlots: [],
}

function candidate(
  name: string,
  demographics: Partial<CandidateDemographics> = {},
  overrides: Partial<BreakoutCandidate> = {}
): BreakoutCandidate {
  return {
    registrantId: `r-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    mobileNumber: null,
    isMember: true,
    isAnonymous: false,
    demographics: { ...EMPTY_DEMOGRAPHICS, ...demographics },
    score: 0.5,
    confidence: 0.5,
    passesGates: true,
    ...overrides,
  }
}

function anonymous(name: string): BreakoutCandidate {
  return candidate(name, {}, { isAnonymous: true, isMember: false })
}

function config(overrides: Partial<EventFormConfigData> = {}): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...overrides }
}

const NOW = new Date("2026-07-31T00:00:00Z")

// ─── ageFromBirth ────────────────────────────────────────────────────────────

describe("ageFromBirth", () => {
  it("returns null without a birth year", () => {
    expect(ageFromBirth(5, null, NOW)).toBeNull()
    expect(ageFromBirth(null, null, NOW)).toBeNull()
  })

  it("subtracts a year when the birthday has not arrived yet", () => {
    // July 2026, born December 1996 → still 29
    expect(ageFromBirth(12, 1996, NOW)).toBe(29)
  })

  it("does not subtract when the birthday has passed", () => {
    // July 2026, born January 1996 → 30
    expect(ageFromBirth(1, 1996, NOW)).toBe(30)
  })

  it("treats the birth month itself as already reached", () => {
    expect(ageFromBirth(7, 1996, NOW)).toBe(30)
  })

  it("assumes the birthday has passed when the month is unknown", () => {
    expect(ageFromBirth(null, 1996, NOW)).toBe(30)
  })
})

// ─── bucketOverlapsRange ─────────────────────────────────────────────────────

describe("bucketOverlapsRange", () => {
  const bucket = (minAge: number | null, maxAge: number | null) => ({
    id: "b",
    label: "b",
    minAge,
    maxAge,
  })

  it("overlaps when the ranges intersect", () => {
    expect(bucketOverlapsRange(bucket(26, 35), 30, 40)).toBe(true)
  })

  it("does not overlap when the bucket sits entirely below the window", () => {
    expect(bucketOverlapsRange(bucket(18, 25), 30, 40)).toBe(false)
  })

  it("does not overlap when the bucket sits entirely above the window", () => {
    expect(bucketOverlapsRange(bucket(50, 60), 30, 40)).toBe(false)
  })

  it("handles an open-ended lower bucket", () => {
    expect(bucketOverlapsRange(bucket(null, 17), 18, undefined)).toBe(false)
    expect(bucketOverlapsRange(bucket(null, 17), undefined, 20)).toBe(true)
  })

  it("handles an open-ended upper bucket", () => {
    expect(bucketOverlapsRange(bucket(60, null), 30, 40)).toBe(false)
    expect(bucketOverlapsRange(bucket(60, null), 65, undefined)).toBe(true)
  })

  it("overlaps everything when the window is unbounded", () => {
    expect(bucketOverlapsRange(bucket(26, 35), undefined, undefined)).toBe(true)
  })
})

// ─── filterBreakoutCandidates ────────────────────────────────────────────────

describe("filterBreakoutCandidates", () => {
  it("returns everything for an empty filter set", () => {
    const pool = [candidate("Ana"), candidate("Ben"), anonymous("Walk In")]
    expect(filterBreakoutCandidates(pool, {}, NOW)).toHaveLength(3)
  })

  it("filters by life stage", () => {
    const pool = [
      candidate("Ana", { lifeStageId: "ls-1" }),
      candidate("Ben", { lifeStageId: "ls-2" }),
    ]
    const out = filterBreakoutCandidates(pool, { lifeStageId: "ls-1" }, NOW)
    expect(out.map((c) => c.name)).toEqual(["Ana"])
  })

  it("filters by gender", () => {
    const pool = [
      candidate("Ana", { gender: "Female" }),
      candidate("Ben", { gender: "Male" }),
      candidate("Cy", { gender: null }),
    ]
    expect(filterBreakoutCandidates(pool, { gender: "Female" }, NOW).map((c) => c.name)).toEqual([
      "Ana",
    ])
  })

  it("filters by meeting preference", () => {
    const pool = [
      candidate("Ana", { meetingPreference: "Online" }),
      candidate("Ben", { meetingPreference: "InPerson" }),
    ]
    expect(
      filterBreakoutCandidates(pool, { meetingPreference: "Online" }, NOW).map((c) => c.name)
    ).toEqual(["Ana"])
  })

  it("ORs within the language filter", () => {
    const pool = [
      candidate("Ana", { language: ["Tagalog"] }),
      candidate("Ben", { language: ["English"] }),
      candidate("Cy", { language: ["Cebuano"] }),
    ]
    const out = filterBreakoutCandidates(pool, { languages: ["Tagalog", "English"] }, NOW)
    expect(out.map((c) => c.name)).toEqual(["Ana", "Ben"])
  })

  it("treats an empty language array as no filter", () => {
    const pool = [candidate("Ana", { language: [] }), candidate("Ben", { language: ["English"] })]
    expect(filterBreakoutCandidates(pool, { languages: [] }, NOW)).toHaveLength(2)
  })

  it("ANDs across different filters", () => {
    const pool = [
      candidate("Ana", { gender: "Female", language: ["Tagalog"] }),
      candidate("Bea", { gender: "Female", language: ["English"] }),
      candidate("Ben", { gender: "Male", language: ["Tagalog"] }),
    ]
    const out = filterBreakoutCandidates(pool, { gender: "Female", languages: ["Tagalog"] }, NOW)
    expect(out.map((c) => c.name)).toEqual(["Ana"])
  })

  it("folds case and whitespace when filtering by work city", () => {
    const pool = [
      candidate("Ana", { workCity: "Makati" }),
      candidate("Ben", { workCity: " makati " }),
      candidate("Cy", { workCity: "Taguig" }),
    ]
    const out = filterBreakoutCandidates(pool, { workCity: "makati" }, NOW)
    expect(out.map((c) => c.name)).toEqual(["Ana", "Ben"])
  })

  it("matches a schedule day against ANY of the candidate's slots", () => {
    const slot = (dayOfWeek: number) => ({ dayOfWeek, timeStart: "19:00", timeEnd: "20:00" })
    const pool = [
      candidate("Ana", { scheduleSlots: [slot(1), slot(3)] }),
      candidate("Ben", { scheduleSlots: [slot(2)] }),
      candidate("Cy", { scheduleSlots: [] }),
    ]
    expect(
      filterBreakoutCandidates(pool, { scheduleDayOfWeek: 3 }, NOW).map((c) => c.name)
    ).toEqual(["Ana"])
  })

  describe("age", () => {
    const bucket = { id: "b-26-35", label: "26 – 35", minAge: 26, maxAge: 35 }

    it("prefers birth year over the reported bucket", () => {
      // Born 1996 → 30 in July 2026, which is outside 40-50 even though the
      // bucket they self-reported would overlap.
      const pool = [
        candidate("Ana", {
          birthMonth: 1,
          birthYear: 1996,
          ageRangeBucket: { id: "b", label: "40+", minAge: 40, maxAge: null },
        }),
      ]
      expect(filterBreakoutCandidates(pool, { minAge: 40 }, NOW)).toHaveLength(0)
    })

    it("falls back to the bucket when birth year is absent", () => {
      const pool = [candidate("Ana", { ageRangeBucket: bucket })]
      expect(filterBreakoutCandidates(pool, { minAge: 30, maxAge: 40 }, NOW)).toHaveLength(1)
      expect(filterBreakoutCandidates(pool, { minAge: 40 }, NOW)).toHaveLength(0)
    })

    it("drops a candidate with neither birth year nor bucket", () => {
      const pool = [candidate("Ana")]
      expect(filterBreakoutCandidates(pool, { minAge: 18 }, NOW)).toHaveLength(0)
    })

    // `ageBucketId` only records which preset produced the window so the select
    // can display it. If it were a rule of its own it would AND with the window
    // and drop anyone who gave a birth year but never picked a bucket.
    it("treats ageBucketId as a label, not a second age rule", () => {
      const pool = [
        candidate("HasBucket", { ageRangeBucket: bucket }),
        candidate("HasBirthYear", { birthMonth: 1, birthYear: 1996 }), // 30
      ]
      const out = filterBreakoutCandidates(
        pool,
        { ageBucketId: "b-26-35", minAge: 26, maxAge: 35 },
        NOW
      )
      expect(out.map((c) => c.name)).toEqual(["HasBucket", "HasBirthYear"])
    })

    it("does not filter at all when only the bucket label is set", () => {
      const pool = [candidate("Ana"), candidate("Ben", { ageRangeBucket: bucket })]
      expect(filterBreakoutCandidates(pool, { ageBucketId: "b-26-35" }, NOW)).toHaveLength(2)
    })

    it("honours only the lower bound when the upper is unset", () => {
      const pool = [
        candidate("Young", { birthMonth: 1, birthYear: 2006 }), // 20
        candidate("Older", { birthMonth: 1, birthYear: 1986 }), // 40
      ]
      expect(filterBreakoutCandidates(pool, { minAge: 30 }, NOW).map((c) => c.name)).toEqual([
        "Older",
      ])
    })
  })

  describe("search", () => {
    it("matches tokens in any order", () => {
      const pool = [candidate("Maria Santos")]
      expect(filterBreakoutCandidates(pool, { search: "santos maria" }, NOW)).toHaveLength(1)
    })

    it("requires every token to match", () => {
      const pool = [candidate("Maria Santos")]
      expect(filterBreakoutCandidates(pool, { search: "maria cruz" }, NOW)).toHaveLength(0)
    })

    it("is case-insensitive over the mobile number too", () => {
      const pool = [candidate("Ana", {}, { mobileNumber: "+63 917 123 4567" })]
      expect(filterBreakoutCandidates(pool, { search: "917 4567" }, NOW)).toHaveLength(1)
    })

    it("treats a blank query as no filter", () => {
      const pool = [candidate("Ana"), candidate("Ben")]
      expect(filterBreakoutCandidates(pool, { search: "   " }, NOW)).toHaveLength(2)
    })

    it("still finds anonymous walk-ins by name", () => {
      const pool = [anonymous("Walk In")]
      expect(filterBreakoutCandidates(pool, { search: "walk" }, NOW)).toHaveLength(1)
    })
  })

  // Regression pin: anonymous walk-ins have no profile, so every attribute
  // filter drops them. The picker must account for that explicitly rather than
  // letting them disappear without explanation.
  it("drops anonymous candidates from any attribute filter", () => {
    const pool = [candidate("Ana", { gender: "Female" }), anonymous("Walk In")]
    const out = filterBreakoutCandidates(pool, { gender: "Female" }, NOW)
    expect(out.map((c) => c.name)).toEqual(["Ana"])
  })
})

// ─── activeFilterCount / hasAttributeFilters ─────────────────────────────────

describe("activeFilterCount", () => {
  it("ignores search", () => {
    expect(activeFilterCount({ search: "ana" })).toBe(0)
    expect(hasAttributeFilters({ search: "ana" })).toBe(false)
  })

  it("counts an age window as one filter", () => {
    expect(activeFilterCount({ minAge: 20, maxAge: 30 })).toBe(1)
  })

  it("ignores an empty language array", () => {
    expect(activeFilterCount({ languages: [] })).toBe(0)
  })

  it("counts distinct filters", () => {
    expect(activeFilterCount({ gender: "Female", lifeStageId: "ls", scheduleDayOfWeek: 0 })).toBe(3)
  })

  it("counts day 0 (Sunday), which is falsy", () => {
    expect(activeFilterCount({ scheduleDayOfWeek: 0 })).toBe(1)
    expect(hasAttributeFilters({ scheduleDayOfWeek: 0 })).toBe(true)
  })
})

// ─── visibleFilters ──────────────────────────────────────────────────────────

describe("visibleFilters", () => {
  it("shows a filter the form collects even when nobody answered", () => {
    expect(visibleFilters(config({ fieldGender: true }), [candidate("Ana")])).toContain("gender")
  })

  it("shows a filter the form no longer collects when someone holds a value", () => {
    const pool = [candidate("Ana", { gender: "Female" })]
    expect(visibleFilters(config(), pool)).toContain("gender")
  })

  it("hides a filter that is neither collected nor answered", () => {
    expect(visibleFilters(config(), [candidate("Ana")])).not.toContain("gender")
  })

  it("hides everything for a bare form and an empty pool", () => {
    expect(visibleFilters(config(), [])).toEqual([])
  })

  it("maps each field toggle to its own filter", () => {
    const all = config(
      Object.fromEntries(
        [
          "fieldLifeStage",
          "fieldGender",
          "fieldBirthDate",
          "fieldAgeRange",
          "fieldWorkCity",
          "fieldLanguage",
          "fieldSchedule",
          "fieldMeetingPreference",
        ].map((k) => [k, true])
      ) as Partial<EventFormConfigData>
    )
    expect(visibleFilters(all, [])).toEqual(CANDIDATE_FILTER_KEYS)
  })

  // Birth date and age range are separate form questions but one filter: both
  // express age, and rendering two controls let an admin set contradictory ones.
  it("surfaces a single age filter from either age question", () => {
    expect(visibleFilters(config({ fieldBirthDate: true }), [])).toEqual(["age"])
    expect(visibleFilters(config({ fieldAgeRange: true }), [])).toEqual(["age"])
    expect(visibleFilters(config({ fieldBirthDate: true, fieldAgeRange: true }), [])).toEqual([
      "age",
    ])
  })

  it("surfaces the age filter when anyone holds either kind of age answer", () => {
    const withYear = [candidate("A", { birthYear: 1996 })]
    const withBucket = [
      candidate("B", { ageRangeBucket: { id: "b", label: "26 – 35", minAge: 26, maxAge: 35 } }),
    ]
    expect(visibleFilters(config(), withYear)).toContain("age")
    expect(visibleFilters(config(), withBucket)).toContain("age")
    expect(visibleFilters(config(), [candidate("C")])).not.toContain("age")
  })
})

// ─── criteriaToFilters ───────────────────────────────────────────────────────

describe("criteriaToFilters", () => {
  const base: BreakoutCriteria = {
    lifeStageIds: [],
    genderFocus: null,
    language: [],
    ageRangeMin: null,
    ageRangeMax: null,
    meetingFormat: null,
    locationCity: null,
    scheduleDayOfWeek: null,
  }

  it("produces no filters from empty criteria", () => {
    expect(criteriaToFilters(base)).toEqual({})
  })

  it("sets gender for a single-gender group", () => {
    expect(criteriaToFilters({ ...base, genderFocus: "Female" }).gender).toBe("Female")
  })

  it("sets no gender filter for a Mixed group", () => {
    expect(criteriaToFilters({ ...base, genderFocus: "Mixed" }).gender).toBeUndefined()
  })

  it("carries a single life stage but not several", () => {
    expect(criteriaToFilters({ ...base, lifeStageIds: ["ls-1"] }).lifeStageId).toBe("ls-1")
    expect(
      criteriaToFilters({ ...base, lifeStageIds: ["ls-1", "ls-2"] }).lifeStageId
    ).toBeUndefined()
  })

  it("carries only the bound that is set", () => {
    const out = criteriaToFilters({ ...base, ageRangeMin: 25 })
    expect(out.minAge).toBe(25)
    expect(out.maxAge).toBeUndefined()
  })

  it("normalizes the group's location city", () => {
    expect(criteriaToFilters({ ...base, locationCity: " Makati " }).workCity).toBe("makati")
  })

  it("ignores a blank location city", () => {
    expect(criteriaToFilters({ ...base, locationCity: "  " }).workCity).toBeUndefined()
  })

  it("carries Sunday (day 0) rather than dropping it as falsy", () => {
    expect(criteriaToFilters({ ...base, scheduleDayOfWeek: 0 }).scheduleDayOfWeek).toBe(0)
  })

  it("copies the language array rather than aliasing it", () => {
    const criteria = { ...base, language: ["Tagalog"] }
    const out = criteriaToFilters(criteria)
    out.languages!.push("English")
    expect(criteria.language).toEqual(["Tagalog"])
  })
})

// ─── option builders ─────────────────────────────────────────────────────────

describe("cityOptions", () => {
  it("groups spellings and displays the most common one", () => {
    const pool = [
      candidate("A", { workCity: "makati" }),
      candidate("B", { workCity: "Makati" }),
      candidate("C", { workCity: "Makati" }),
    ]
    expect(cityOptions(pool)).toEqual([{ value: "makati", label: "Makati" }])
  })

  it("breaks casing ties alphabetically for a stable list", () => {
    const pool = [candidate("A", { workCity: "Makati" }), candidate("B", { workCity: "makati" })]
    expect(cityOptions(pool)[0].label).toBe("Makati")
  })

  it("skips blank and null cities", () => {
    const pool = [candidate("A", { workCity: "  " }), candidate("B", { workCity: null })]
    expect(cityOptions(pool)).toEqual([])
  })

  it("sorts options by label", () => {
    const pool = [candidate("A", { workCity: "Taguig" }), candidate("B", { workCity: "Makati" })]
    expect(cityOptions(pool).map((o) => o.label)).toEqual(["Makati", "Taguig"])
  })
})

describe("languageOptions", () => {
  it("returns the distinct languages in the pool, sorted", () => {
    const pool = [
      candidate("A", { language: ["Tagalog", "English"] }),
      candidate("B", { language: ["English"] }),
    ]
    expect(languageOptions(pool)).toEqual(["English", "Tagalog"])
  })

  it("returns nothing for an empty pool", () => {
    expect(languageOptions([])).toEqual([])
  })
})

// ─── sortCandidates ──────────────────────────────────────────────────────────

describe("sortCandidates", () => {
  it("sinks gate-failers below everyone eligible regardless of score", () => {
    const pool = [
      candidate("HighButIneligible", {}, { score: 0.95, passesGates: false }),
      candidate("LowButEligible", {}, { score: 0.2, passesGates: true }),
    ]
    expect(sortCandidates(pool, "fit").map((c) => c.name)).toEqual([
      "LowButEligible",
      "HighButIneligible",
    ])
  })

  it("breaks score ties on confidence", () => {
    const pool = [
      candidate("Guessy", {}, { score: 0.7, confidence: 0.1 }),
      candidate("Measured", {}, { score: 0.7, confidence: 0.9 }),
    ]
    expect(sortCandidates(pool, "fit").map((c) => c.name)).toEqual(["Measured", "Guessy"])
  })

  it("sorts by name", () => {
    const pool = [candidate("Zoe"), candidate("Ana")]
    expect(sortCandidates(pool, "name").map((c) => c.name)).toEqual(["Ana", "Zoe"])
  })

  it("reverses registration order for recent", () => {
    const pool = [candidate("First"), candidate("Second"), candidate("Third")]
    expect(sortCandidates(pool, "recent").map((c) => c.name)).toEqual([
      "Third",
      "Second",
      "First",
    ])
  })

  it("does not mutate the input array", () => {
    const pool = [candidate("Zoe"), candidate("Ana")]
    sortCandidates(pool, "name")
    expect(pool.map((c) => c.name)).toEqual(["Zoe", "Ana"])
  })
})

// ─── normalizeCity ───────────────────────────────────────────────────────────

describe("normalizeCity", () => {
  it("folds case and trims", () => {
    expect(normalizeCity("  Makati City ")).toBe("makati city")
  })
})
