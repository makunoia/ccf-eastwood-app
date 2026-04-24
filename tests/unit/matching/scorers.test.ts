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
} from "@/lib/matching/scorers"

// ---------------------------------------------------------------------------
// scoreLifeStage
// ---------------------------------------------------------------------------
describe("scoreLifeStage", () => {
  it("returns 1.0 when IDs match", () => {
    expect(scoreLifeStage("ls-1", "ls-1")).toBe(1.0)
  })

  it("returns 0.0 when IDs differ", () => {
    expect(scoreLifeStage("ls-1", "ls-2")).toBe(0.0)
  })

  it("returns 0.5 when group has no life stage (accepts all)", () => {
    expect(scoreLifeStage("ls-1", null)).toBe(0.5)
  })

  it("returns 0.5 when candidate has no life stage data", () => {
    expect(scoreLifeStage(null, "ls-1")).toBe(0.5)
  })

  it("returns 0.5 when both are null", () => {
    expect(scoreLifeStage(null, null)).toBe(0.5)
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

  it("returns ratio of matching members", () => {
    expect(scoreCareer("Tech", ["Tech", "Finance", "Tech", "Law"])).toBe(0.5)
  })

  it("returns 0.0 when no members share the industry", () => {
    expect(scoreCareer("Tech", ["Finance", "Law", "Healthcare"])).toBe(0.0)
  })
})

// ---------------------------------------------------------------------------
// scoreCapacity
// ---------------------------------------------------------------------------
describe("scoreCapacity", () => {
  it("returns 1.0 when group has no member limit", () => {
    expect(scoreCapacity(null, 50)).toBe(1.0)
  })

  it("returns 1.0 when group is completely empty", () => {
    expect(scoreCapacity(10, 0)).toBe(1.0)
  })

  it("returns 0.5 when group is half full", () => {
    expect(scoreCapacity(10, 5)).toBe(0.5)
  })

  it("returns 0.0 when group is full", () => {
    expect(scoreCapacity(10, 10)).toBe(0.0)
  })

  it("returns 0.0 when group is over capacity", () => {
    expect(scoreCapacity(10, 12)).toBe(0.0)
  })

  it("returns proportional score for varying capacities", () => {
    expect(scoreCapacity(4, 1)).toBe(0.75)
    expect(scoreCapacity(4, 3)).toBe(0.25)
  })
})
