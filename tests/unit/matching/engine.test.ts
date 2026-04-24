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
  lifeStageId: null,
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
    // scoreGender(null, null) = 1.0  — no gender focus means group accepts all (positive)
    // scoreCapacity(null, 0) = 1.0   — no member limit means unlimited (positive)
    // all other scorers return 0.5 for null/empty inputs
    // totalScore = (0.5 × 7 + 1.0 × 2) / 9 = 5.5/9 ≈ 0.6111
    const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
    expect(result.totalScore).toBeCloseTo(5.5 / 9, 5)
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
      lifeStageId: "ls-yp",
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
      lifeStageId: "ls-yp",
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

  it("respects weights — higher weight for a matched dimension increases total score", () => {
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      lifeStageId: "ls-1",
    }
    const group: GroupProfile = {
      ...BASE_GROUP,
      lifeStageId: "ls-1",
    }

    // Weights that heavily favour lifeStage
    const heavyLifeStageWeights: WeightConfig = {
      lifeStage: 0.8,
      gender: 0.025,
      language: 0.025,
      age: 0.025,
      schedule: 0.025,
      location: 0.025,
      mode: 0.025,
      career: 0.025,
      capacity: 0.025,
    }

    const result = scoreGroup(candidate, group, heavyLifeStageWeights)
    // lifeStage=1.0 * 0.8 + rest * ~0.5 → > 0.9
    expect(result.totalScore).toBeGreaterThan(0.9)
  })

  it("full group (at capacity) scores lower than a group with open slots (all else equal)", () => {
    const fullGroup: GroupProfile = { ...BASE_GROUP, memberLimit: 10, currentCount: 10 }
    const openGroup: GroupProfile = { ...BASE_GROUP, memberLimit: 10, currentCount: 2 }

    const fullResult = scoreGroup(EMPTY_CANDIDATE, fullGroup, EQUAL_WEIGHTS)
    const openResult = scoreGroup(EMPTY_CANDIDATE, openGroup, EQUAL_WEIGHTS)

    expect(openResult.totalScore).toBeGreaterThan(fullResult.totalScore)
  })
})
