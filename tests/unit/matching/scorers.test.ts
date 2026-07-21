import { describe, it, expect } from "vitest"
import {
  scoreLifeStage,
  scoreGender,
  scoreLanguage,
  scoreAge,
  scoreSchedule,
  scoreLocation,
  scoreMode,
  scoreCareer,
  scoreCapacity,
  scoreLifeStageDetailed,
  scoreGenderDetailed,
  scoreLanguageDetailed,
  scoreAgeDetailed,
  scoreScheduleDetailed,
  scoreLocationDetailed,
  scoreModeDetailed,
  scoreCareerDetailed,
  scoreCapacityDetailed,
} from "@/lib/matching/scorers"

// ---------------------------------------------------------------------------
// scoreLifeStage
// ---------------------------------------------------------------------------
describe("scoreLifeStage", () => {
  it("returns 1.0 when candidate's life stage is in the group's set", () => {
    expect(scoreLifeStage("ls-1", ["ls-1"])).toBe(1.0)
    expect(scoreLifeStage("ls-1", ["ls-2", "ls-1"])).toBe(1.0)
  })

  it("returns 0.0 when candidate's life stage is not in the group's set", () => {
    expect(scoreLifeStage("ls-1", ["ls-2"])).toBe(0.0)
  })

  it("returns 0.5 when group has no life stages (accepts all)", () => {
    expect(scoreLifeStage("ls-1", [])).toBe(0.5)
  })

  it("returns 0.5 when candidate has no life stage data", () => {
    expect(scoreLifeStage(null, ["ls-1"])).toBe(0.5)
  })

  it("returns 0.5 when both are empty/null", () => {
    expect(scoreLifeStage(null, [])).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreGender
// ---------------------------------------------------------------------------
describe("scoreGender", () => {
  it("returns 1.0 when candidate gender matches group focus", () => {
    expect(scoreGender("Male", "Male")).toBe(1.0)
    expect(scoreGender("Female", "Female")).toBe(1.0)
  })

  it("returns 0.0 when candidate gender does not match group focus", () => {
    expect(scoreGender("Male", "Female")).toBe(0.0)
    expect(scoreGender("Female", "Male")).toBe(0.0)
  })

  it("returns 1.0 when group is Mixed", () => {
    expect(scoreGender("Male", "Mixed")).toBe(1.0)
    expect(scoreGender("Female", "Mixed")).toBe(1.0)
  })

  it("returns 1.0 when group has no gender focus", () => {
    expect(scoreGender("Male", null)).toBe(1.0)
    expect(scoreGender(null, null)).toBe(1.0)
  })

  it("returns 0.5 when candidate gender is unknown but group has a focus", () => {
    expect(scoreGender(null, "Male")).toBe(0.5)
    expect(scoreGender(null, "Female")).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreLanguage
// ---------------------------------------------------------------------------
describe("scoreLanguage", () => {
  it("returns 1.0 when primary language matches", () => {
    expect(scoreLanguage(["Filipino"], ["Filipino"])).toBe(1.0)
  })

  it("returns 1.0 when any candidate language matches", () => {
    expect(scoreLanguage(["English", "Filipino"], ["Filipino"])).toBe(1.0)
  })

  it("returns 0.0 when no languages overlap", () => {
    expect(scoreLanguage(["English"], ["Filipino"])).toBe(0.0)
  })

  it("returns 0.5 when group has no language preference", () => {
    expect(scoreLanguage(["English"], [])).toBe(0.5)
  })

  it("returns 0.5 when candidate has no language data", () => {
    expect(scoreLanguage([], ["Filipino"])).toBe(0.5)
  })

  it("returns 0.5 when both are empty", () => {
    expect(scoreLanguage([], [])).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreAge
// ---------------------------------------------------------------------------
describe("scoreAge", () => {
  const currentYear = new Date().getFullYear()

  it("returns 1.0 when age is within range", () => {
    // A 25-year-old for a 20-30 group
    const birthYear = currentYear - 25
    expect(scoreAge(1, birthYear, 20, 30)).toBe(1.0)
  })

  it("returns 0.5 when birthYear is unknown", () => {
    expect(scoreAge(null, null, 20, 30)).toBe(0.5)
  })

  it("returns 0.5 when group has no age range", () => {
    expect(scoreAge(1, currentYear - 25, null, null)).toBe(0.5)
  })

  it("decays linearly for age below min range", () => {
    // Group wants 30+, candidate is 25 — 5 years below
    const birthYear = currentYear - 25
    const score = scoreAge(1, birthYear, 30, null)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
    expect(score).toBeCloseTo(0.5, 0) // 5/10 decay = 0.5
  })

  it("decays linearly for age above max range", () => {
    // Group wants up to 30, candidate is 35 — 5 years above
    const birthYear = currentYear - 35
    const score = scoreAge(1, birthYear, null, 30)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
    expect(score).toBeCloseTo(0.5, 0)
  })

  it("returns 0.0 when age is 10+ years outside range", () => {
    const birthYear = currentYear - 50
    const score = scoreAge(1, birthYear, 20, 30)
    expect(score).toBe(0)
  })

  it("uses birth month for more accurate age calculation", () => {
    const birthYear = currentYear - 20
    // Born last month — should be 20 (not yet 21)
    const lastMonth = new Date().getMonth() // 0-indexed = previous month if we use 1-indexed
    const score = scoreAge(lastMonth === 0 ? 12 : lastMonth, birthYear, 20, 25)
    expect(score).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// scoreSchedule
// ---------------------------------------------------------------------------
describe("scoreSchedule", () => {
  const monday9to11 = { dayOfWeek: 1, timeStart: "09:00", timeEnd: "11:00" }
  const monday10to12 = { dayOfWeek: 1, timeStart: "10:00", timeEnd: "12:00" }
  const tuesday9to11 = { dayOfWeek: 2, timeStart: "09:00", timeEnd: "11:00" }
  const monday14to16 = { dayOfWeek: 1, timeStart: "14:00", timeEnd: "16:00" }

  it("returns 1.0 when all group slots overlap with candidate slots", () => {
    expect(scoreSchedule([monday9to11], [monday9to11])).toBe(1.0)
  })

  it("returns 1.0 when slots partially overlap in time", () => {
    expect(scoreSchedule([monday9to11], [monday10to12])).toBe(1.0)
  })

  it("returns 0.0 when days do not match", () => {
    expect(scoreSchedule([monday9to11], [tuesday9to11])).toBe(0.0)
  })

  it("returns 0.0 when same day but non-overlapping times", () => {
    expect(scoreSchedule([monday9to11], [monday14to16])).toBe(0.0)
  })

  it("returns 0.5 when candidate has no schedule data", () => {
    expect(scoreSchedule([], [monday9to11])).toBe(0.5)
  })

  it("returns 0.5 when group has no schedule data", () => {
    expect(scoreSchedule([monday9to11], [])).toBe(0.5)
  })

  it("returns partial score when candidate matches some but not all group slots", () => {
    // Group has 2 slots, candidate covers 1
    const score = scoreSchedule([monday9to11], [monday9to11, tuesday9to11])
    expect(score).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreLocation
// ---------------------------------------------------------------------------
describe("scoreLocation", () => {
  it("returns 1.0 when cities match", () => {
    expect(scoreLocation("Makati", "Makati")).toBe(1.0)
  })

  it("returns 0.0 when cities differ", () => {
    expect(scoreLocation("Makati", "BGC")).toBe(0.0)
  })

  it("returns 0.5 when candidate has no work city", () => {
    expect(scoreLocation(null, "Makati")).toBe(0.5)
  })

  it("returns 0.5 when group has no location", () => {
    expect(scoreLocation("Makati", null)).toBe(0.5)
  })

  it("returns 0.5 when both are null", () => {
    expect(scoreLocation(null, null)).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreMode
// ---------------------------------------------------------------------------
describe("scoreMode", () => {
  it("returns 1.0 for exact match", () => {
    expect(scoreMode("Online", "Online")).toBe(1.0)
    expect(scoreMode("InPerson", "InPerson")).toBe(1.0)
    expect(scoreMode("Hybrid", "Hybrid")).toBe(1.0)
  })

  it("returns 0.5 when either is Hybrid (partial compatibility)", () => {
    expect(scoreMode("Hybrid", "Online")).toBe(0.5)
    expect(scoreMode("Online", "Hybrid")).toBe(0.5)
    expect(scoreMode("Hybrid", "InPerson")).toBe(0.5)
  })

  it("returns 0.0 when Online vs InPerson (incompatible)", () => {
    expect(scoreMode("Online", "InPerson")).toBe(0.0)
    expect(scoreMode("InPerson", "Online")).toBe(0.0)
  })

  it("returns 0.5 when candidate preference is unknown", () => {
    expect(scoreMode(null, "Online")).toBe(0.5)
  })

  it("returns 0.5 when group format is unknown", () => {
    expect(scoreMode("Online", null)).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreCareer
// ---------------------------------------------------------------------------
describe("scoreCareer", () => {
  it("returns 0.5 when candidate has no industry", () => {
    expect(scoreCareer(null, ["Tech", "Finance"])).toBe(0.5)
  })

  it("returns 0.5 when group has no members yet", () => {
    expect(scoreCareer("Tech", [])).toBe(0.5)
  })

  it("returns 1.0 when all members share the same industry", () => {
    expect(scoreCareer("Tech", ["Tech", "Tech", "Tech"])).toBe(1.0)
  })

  it("scores on peer count, saturating at three", () => {
    expect(scoreCareer("Tech", ["Tech", "Finance"])).toBe(0.7)
    expect(scoreCareer("Tech", ["Tech", "Tech", "Finance"])).toBe(0.85)
    expect(scoreCareer("Tech", ["Tech", "Tech", "Tech", "Finance"])).toBe(1.0)
    expect(scoreCareer("Tech", ["Tech", "Tech", "Tech", "Tech", "Finance"])).toBe(1.0)
  })

  it("returns a weak but non-zero score when no members share the industry", () => {
    // Being the only person in your field is not disqualifying
    expect(scoreCareer("Tech", ["Finance", "Law", "Healthcare"])).toBe(0.25)
  })

  it("REGRESSION: more industry peers never scores worse, regardless of group size", () => {
    // Previously matchCount/length, so a big group with many peers lost to a
    // tiny group with one: 3/10 = 0.30 vs 1/2 = 0.50.
    const bigGroupManyPeers = scoreCareer("Tech", [
      "Tech", "Tech", "Tech",
      "Finance", "Finance", "Law", "Law", "Health", "Health", "Retail",
    ])
    const smallGroupOnePeer = scoreCareer("Tech", ["Tech", "Finance"])

    expect(bigGroupManyPeers).toBeGreaterThan(smallGroupOnePeer)
  })
})

// ---------------------------------------------------------------------------
// scoreCapacity
// ---------------------------------------------------------------------------
describe("scoreCapacity", () => {
  it("returns a neutral 0.5 when the group has no member limit", () => {
    // Unknown, not ideal — see the regression test below
    expect(scoreCapacity(null, 50)).toBe(0.5)
  })

  it("returns 1.0 when group is completely empty", () => {
    expect(scoreCapacity(10, 0)).toBe(1.0)
  })

  it("returns 0.0 when group is full", () => {
    expect(scoreCapacity(10, 10)).toBe(0.0)
  })

  it("returns 0.0 when group is over capacity", () => {
    expect(scoreCapacity(10, 12)).toBe(0.0)
  })

  it("scores on absolute open seats, saturating at three", () => {
    expect(scoreCapacity(10, 9)).toBeCloseTo(0.6) // 1 seat
    expect(scoreCapacity(10, 8)).toBeCloseTo(0.8) // 2 seats
    expect(scoreCapacity(10, 7)).toBeCloseTo(1.0) // 3 seats
    expect(scoreCapacity(10, 5)).toBeCloseTo(1.0) // 5 seats
  })

  it("REGRESSION: an unconfigured group no longer outranks one with open seats", () => {
    // memberLimit: null used to score 1.0, so not setting a limit beat every
    // group whose leader had actually configured one.
    expect(scoreCapacity(null, 50)).toBeLessThan(scoreCapacity(10, 5))
  })

  it("REGRESSION: equal open seats score equally regardless of limit size", () => {
    // Previously openSlots/memberLimit, so a 20-cap group with 1 member (0.95)
    // beat a 4-cap group with 1 member (0.75) despite both simply having room.
    expect(scoreCapacity(20, 1)).toBe(scoreCapacity(4, 1))
  })
})

// ---------------------------------------------------------------------------
// Detailed scorers — the `known` flag
//
// `known: false` means the factor could not be measured, so its 0.5 is a
// placeholder rather than a real half-fit. This is what separates "we checked
// and it's middling" from "we have no idea", and it feeds match confidence.
// ---------------------------------------------------------------------------
describe("detailed scorers — known flag", () => {
  it("marks life stage unknown when either side has no data", () => {
    expect(scoreLifeStageDetailed("a", [])).toEqual({ score: 0.5, known: false })
    expect(scoreLifeStageDetailed(null, ["a"])).toEqual({ score: 0.5, known: false })
    expect(scoreLifeStageDetailed("a", ["a"])).toEqual({ score: 1.0, known: true })
    expect(scoreLifeStageDetailed("a", ["b"])).toEqual({ score: 0.0, known: true })
  })

  it("treats an open group as a known pass for gender but unknown candidate as unknown", () => {
    // No focus set means everyone qualifies — that is measured, not missing
    expect(scoreGenderDetailed(null, null)).toEqual({ score: 1.0, known: true })
    expect(scoreGenderDetailed(null, "Mixed")).toEqual({ score: 1.0, known: true })
    // A gendered group with no candidate gender on file genuinely is unknown
    expect(scoreGenderDetailed(null, "Female")).toEqual({ score: 0.5, known: false })
    expect(scoreGenderDetailed("Female", "Female")).toEqual({ score: 1.0, known: true })
  })

  it("marks language unknown when either side is empty", () => {
    expect(scoreLanguageDetailed([], ["English"])).toEqual({ score: 0.5, known: false })
    expect(scoreLanguageDetailed(["English"], [])).toEqual({ score: 0.5, known: false })
    expect(scoreLanguageDetailed(["English"], ["English"])).toEqual({ score: 1.0, known: true })
  })

  it("marks age unknown without a birth year or a group range", () => {
    expect(scoreAgeDetailed(1, null, 20, 30)).toEqual({ score: 0.5, known: false })
    expect(scoreAgeDetailed(1, 1990, null, null)).toEqual({ score: 0.5, known: false })
    expect(scoreAgeDetailed(1, 1990, 0, 200).known).toBe(true)
  })

  it("marks schedule unknown when either side has no slots", () => {
    const slot = { dayOfWeek: 1, timeStart: "19:00", timeEnd: "21:00" }
    expect(scoreScheduleDetailed([], [slot])).toEqual({ score: 0.5, known: false })
    expect(scoreScheduleDetailed([slot], [])).toEqual({ score: 0.5, known: false })
    expect(scoreScheduleDetailed([slot], [slot])).toEqual({ score: 1.0, known: true })
  })

  it("marks location unknown when either city is missing", () => {
    expect(scoreLocationDetailed(null, "Makati")).toEqual({ score: 0.5, known: false })
    expect(scoreLocationDetailed("Makati", null)).toEqual({ score: 0.5, known: false })
    expect(scoreLocationDetailed("Makati", "Makati")).toEqual({ score: 1.0, known: true })
    expect(scoreLocationDetailed("Makati", "Cebu")).toEqual({ score: 0.0, known: true })
  })

  it("marks mode unknown when either preference is missing", () => {
    expect(scoreModeDetailed(null, "Online")).toEqual({ score: 0.5, known: false })
    expect(scoreModeDetailed("Online", null)).toEqual({ score: 0.5, known: false })
    // A Hybrid half-match is measured, not missing — same number, different meaning
    expect(scoreModeDetailed("Hybrid", "Online")).toEqual({ score: 0.5, known: true })
  })

  it("marks career unknown without a candidate industry or group roster", () => {
    expect(scoreCareerDetailed(null, ["Tech"])).toEqual({ score: 0.5, known: false })
    expect(scoreCareerDetailed("Tech", [])).toEqual({ score: 0.5, known: false })
    expect(scoreCareerDetailed("Tech", ["Tech"])).toEqual({ score: 0.7, known: true })
  })

  it("marks capacity unknown when no member limit is set", () => {
    expect(scoreCapacityDetailed(null, 5)).toEqual({ score: 0.5, known: false })
    expect(scoreCapacityDetailed(10, 0)).toEqual({ score: 1.0, known: true })
  })

  it("keeps each plain scorer in step with its detailed counterpart", () => {
    expect(scoreCareer("Tech", ["Tech", "Tech"])).toBe(
      scoreCareerDetailed("Tech", ["Tech", "Tech"]).score
    )
    expect(scoreCapacity(10, 8)).toBe(scoreCapacityDetailed(10, 8).score)
    expect(scoreGender("Male", "Female")).toBe(scoreGenderDetailed("Male", "Female").score)
  })
})
