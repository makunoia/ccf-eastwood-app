import { describe, it, expect } from "vitest"
import { scoreGroup } from "@/lib/matching/engine"
import type { CandidateProfile, GroupProfile, WeightConfig } from "@/lib/matching/types"
import { EMPTY_CANDIDATE } from "@/lib/matching/types"

// Equal weights for predictable math in tests
const EQUAL_WEIGHTS: WeightConfig = {
  lifeStage: 1 / 9,
  gender: 1 / 9,
  language: 1 / 9,
  age: 1 / 9,
  schedule: 1 / 9,
  location: 1 / 9,
  mode: 1 / 9,
  career: 1 / 9,
  capacity: 1 / 9,
}

const BASE_GROUP: GroupProfile = {
  id: "group-1",
  name: "Young Professionals",
  lifeStageIds: [],
  lifeStageNames: [],
  genderFocus: null,
  language: [],
  ageRangeMin: null,
  ageRangeMax: null,
  meetingFormat: null,
  locationCity: null,
  memberLimit: null,
  currentCount: 0,
  memberIndustries: [],
  scheduleSlots: [],
}

describe("scoreGroup", () => {
  it("returns groupId and groupName from the group profile", () => {
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    expect(result.groupId).toBe("group-1")
    expect(result.groupName).toBe("Young Professionals")
  })

  it("returns a breakdown with all 9 dimension scores", () => {
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    const keys: (keyof typeof result.breakdown)[] = [
      "lifeStage", "gender", "language", "age",
      "schedule", "location", "mode", "career", "capacity",
    ]
    for (const key of keys) {
      expect(result.breakdown[key]).toBeTypeOf("number")
    }
  })

  it("returns totalScore between 0 and 1", () => {
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    expect(result.totalScore).toBeGreaterThanOrEqual(0)
    expect(result.totalScore).toBeLessThanOrEqual(1)
  })

  it("returns correct totalScore when candidate and group have no data", () => {
    // Gate factors (lifeStage, gender, schedule) carry no weight — only the six
    // active factors are scored, and all six return 0.5 for empty inputs, so
    // the normalised total is 0.5.
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    expect(result.totalScore).toBeCloseTo(0.5, 5)
  })

  it("ignores gate-factor weights entirely (they are hard filters, not weights)", () => {
    // lifeStage is a gate. Piling weight onto it must not move the score,
    // because eligibility is decided upstream, never here.
    const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, lifeStageId: "ls-1" }
    const group: GroupProfile = { ...BASE_GROUP, lifeStageIds: ["ls-1"] }

    const heavyGate = scoreGroup(candidate, group, {
      ...EQUAL_WEIGHTS,
      lifeStage: 0.9,
    })
    const noGate = scoreGroup(candidate, group, { ...EQUAL_WEIGHTS, lifeStage: 0 })

    expect(heavyGate.totalScore).toBeCloseTo(noGate.totalScore, 10)
  })

  it("reports coverage and confidence", () => {
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    // No active factor is measurable for an empty candidate → zero confidence.
    // (A group with no gender focus is a "known" pass, but gender is a gate and
    // doesn't count toward confidence.)
    expect(result.confidence).toBe(0)
    expect(result.coverage.language).toBe(false)
    expect(result.coverage.age).toBe(false)
    expect(result.coverage.capacity).toBe(false)
  })

  it("confidence rises as more active factors are measured", () => {
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      language: ["English"],
      workCity: "Makati",
    }
    const group: GroupProfile = {
      ...BASE_GROUP,
      language: ["English"],
      locationCity: "Makati",
    }
    const result = scoreGroup(candidate, group, EQUAL_WEIGHTS)

    expect(result.coverage.language).toBe(true)
    expect(result.coverage.location).toBe(true)
    expect(result.coverage.age).toBe(false)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThan(1)
  })

  it("falls back to default weights when every active weight is zero", () => {
    const allGateWeights: WeightConfig = {
      lifeStage: 0.5, gender: 0.3, schedule: 0.2,
      language: 0, age: 0, location: 0, mode: 0, career: 0, capacity: 0,
    }
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, allGateWeights)
    // Would be NaN without the fallback
    expect(Number.isFinite(result.totalScore)).toBe(true)
    expect(result.totalScore).toBeCloseTo(0.5, 5)
  })

  it("returns higher score for well-matched candidate", () => {
    const currentYear = new Date().getFullYear()

    const candidate: CandidateProfile = {
      lifeStageId: "ls-yp",
      gender: "Male",
      language: ["Filipino"],
      birthMonth: 6,
      birthYear: currentYear - 28,
      workCity: "Makati",
      workIndustry: "Tech",
      meetingPreference: "Hybrid",
      scheduleSlots: [{ dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" }],
    }

    const group: GroupProfile = {
      ...BASE_GROUP,
      lifeStageIds: ["ls-yp"],
      genderFocus: "Male",
      language: ["Filipino"],
      ageRangeMin: 25,
      ageRangeMax: 35,
      meetingFormat: "Hybrid",
      locationCity: "Makati",
      memberLimit: 10,
      currentCount: 3,
      memberIndustries: ["Tech", "Tech", "Finance"],
      scheduleSlots: [{ dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" }],
    }

    const result = scoreGroup(candidate, group, EQUAL_WEIGHTS)
    expect(result.totalScore).toBeGreaterThan(0.8)
  })

  it("returns lower score for a mismatched candidate", () => {
    const currentYear = new Date().getFullYear()

    const candidate: CandidateProfile = {
      lifeStageId: "ls-young",
      gender: "Female",
      language: ["English"],
      birthMonth: 1,
      birthYear: currentYear - 55, // age mismatch
      workCity: "Cebu",
      workIndustry: "Healthcare",
      meetingPreference: "InPerson",
      scheduleSlots: [{ dayOfWeek: 3, timeStart: "18:00", timeEnd: "20:00" }],
    }

    const group: GroupProfile = {
      ...BASE_GROUP,
      lifeStageIds: ["ls-yp"],
      genderFocus: "Male",
      language: ["Filipino"],
      ageRangeMin: 20,
      ageRangeMax: 30,
      meetingFormat: "Online",
      locationCity: "Makati",
      memberLimit: 10,
      currentCount: 3,
      memberIndustries: ["Tech", "Tech", "Tech"],
      scheduleSlots: [{ dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" }],
    }

    const result = scoreGroup(candidate, group, EQUAL_WEIGHTS)
    expect(result.totalScore).toBeLessThan(0.3)
  })

  it("respects weights — higher weight for a matched active dimension increases total score", () => {
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      language: ["Filipino"],
    }
    const group: GroupProfile = {
      ...BASE_GROUP,
      language: ["Filipino"],
    }

    // Weights that heavily favour language (an active factor)
    const heavyLanguageWeights: WeightConfig = {
      lifeStage: 0, gender: 0, schedule: 0,
      language: 0.75,
      age: 0.05,
      location: 0.05,
      mode: 0.05,
      career: 0.05,
      capacity: 0.05,
    }

    const result = scoreGroup(candidate, group, heavyLanguageWeights)
    // language=1.0 * 0.75 + rest * ~0.5 (of 1.0 active total) → > 0.85
    expect(result.totalScore).toBeGreaterThan(0.85)
  })

  it("full group (at capacity) scores lower than a group with open slots (all else equal)", () => {
    const fullGroup: GroupProfile = { ...BASE_GROUP, memberLimit: 10, currentCount: 10 }
    const openGroup: GroupProfile = { ...BASE_GROUP, memberLimit: 10, currentCount: 2 }

    const fullResult = scoreGroup(EMPTY_CANDIDATE, fullGroup, EQUAL_WEIGHTS)
    const openResult = scoreGroup(EMPTY_CANDIDATE, openGroup, EQUAL_WEIGHTS)

    expect(openResult.totalScore).toBeGreaterThan(fullResult.totalScore)
  })

  it("scores a legacy row (nonzero gate weights) identically to a renormalised one", () => {
    // This is why no data migration is needed: because the engine normalises by
    // the active-weight total and ignores gates, a config carrying leftover gate
    // weight produces the same score as one where those columns are zeroed and
    // the six active weights are renormalised to sum to 1.
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      language: ["Filipino"],
      workCity: "Makati",
      workIndustry: "Tech",
    }
    const group: GroupProfile = {
      ...BASE_GROUP,
      language: ["Filipino"],
      locationCity: "Makati",
      memberLimit: 10,
      currentCount: 4,
      memberIndustries: ["Tech", "Finance"],
    }

    // The pre-change defaults — gates still carrying weight, everything sums to 1
    const legacy: WeightConfig = {
      lifeStage: 0.2, gender: 0.1, schedule: 0.15,
      language: 0.1, age: 0.15, location: 0.1, mode: 0.05, career: 0.05, capacity: 0.1,
    }
    // Same six active values, gates zeroed, renormalised to sum to 1
    const activeSum = 0.1 + 0.15 + 0.1 + 0.05 + 0.05 + 0.1
    const renormalised: WeightConfig = {
      lifeStage: 0, gender: 0, schedule: 0,
      language: 0.1 / activeSum,
      age: 0.15 / activeSum,
      location: 0.1 / activeSum,
      mode: 0.05 / activeSum,
      career: 0.05 / activeSum,
      capacity: 0.1 / activeSum,
    }

    const legacyScore = scoreGroup(candidate, group, legacy).totalScore
    const renormScore = scoreGroup(candidate, group, renormalised).totalScore

    expect(legacyScore).toBeCloseTo(renormScore, 10)
  })
})
