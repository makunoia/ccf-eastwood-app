import { describe, it, expect } from "vitest"
import { buildFitReasons } from "@/components/small-group-match-card"
import { scoreGroup } from "@/lib/matching/engine"
import type { CandidateProfile, GroupProfile, WeightConfig } from "@/lib/matching/types"
import { EMPTY_CANDIDATE } from "@/lib/matching/types"

const EQUAL_WEIGHTS: WeightConfig = {
  lifeStage: 1 / 9, gender: 1 / 9, language: 1 / 9, age: 1 / 9, schedule: 1 / 9,
  location: 1 / 9, mode: 1 / 9, career: 1 / 9, capacity: 1 / 9,
}

const GROUP: GroupProfile = {
  id: "g", name: "Group",
  lifeStageIds: ["ls-1"], lifeStageNames: ["Young Adults"],
  genderFocus: "Mixed",
  language: ["Filipino"],
  ageRangeMin: 25, ageRangeMax: 35,
  meetingFormat: "InPerson",
  locationCity: "Makati",
  memberLimit: 10, currentCount: 3,
  memberIndustries: ["Tech", "Tech"],
  scheduleSlots: [{ dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" }],
}

describe("buildFitReasons", () => {
  it("puts strong measured factors in strengths", () => {
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      language: ["Filipino"],
      workCity: "Makati",
      workIndustry: "Tech",
    }
    const { strengths, considerations } = buildFitReasons(scoreGroup(candidate, GROUP, EQUAL_WEIGHTS))

    expect(strengths).toContain("Language preferences overlap.")
    expect(strengths).toContain("Located near the group.")
    expect(considerations).toEqual([])
  })

  it("puts poor measured factors in considerations", () => {
    const candidate: CandidateProfile = {
      ...EMPTY_CANDIDATE,
      language: ["English"], // no overlap with Filipino
      workCity: "Cebu", // different city
    }
    const { strengths, considerations } = buildFitReasons(scoreGroup(candidate, GROUP, EQUAL_WEIGHTS))

    expect(considerations).toContain("No shared language with this group.")
    expect(considerations).toContain("Works in a different area from the group.")
    expect(strengths).not.toContain("Language preferences overlap.")
  })

  it("says nothing about factors it could not measure", () => {
    // Only language known; everything else on the candidate is blank
    const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, language: ["Filipino"] }
    const { strengths, considerations } = buildFitReasons(scoreGroup(candidate, GROUP, EQUAL_WEIGHTS))
    const all = [...strengths, ...considerations]

    // Unmeasured factors must not surface either their strength or weak phrasing
    const unmeasuredPhrases = [
      "Age fits", "Age sits",
      "Meeting format matches", "Meeting format differs",
      "Shares an industry", "Different industry",
    ]
    for (const phrase of unmeasuredPhrases) {
      expect(all.some((r) => r.includes(phrase)), `unexpected reason: ${phrase}`).toBe(false)
    }
  })

  it("does not emit a gender reason for a mixed-focus group", () => {
    const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, gender: "Female" }
    const { strengths, considerations } = buildFitReasons(scoreGroup(candidate, GROUP, EQUAL_WEIGHTS))
    const all = [...strengths, ...considerations].join(" ").toLowerCase()

    expect(all).not.toContain("gender")
  })

  it("emits a gender consideration when a specific-focus group conflicts", () => {
    const womens: GroupProfile = { ...GROUP, genderFocus: "Female" }
    const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, gender: "Male" }
    const { considerations } = buildFitReasons(scoreGroup(candidate, womens, EQUAL_WEIGHTS))

    expect(considerations).toContain("Gender focus doesn't match.")
  })

  it("REGRESSION: a weak, near-empty match makes no positive claim", () => {
    // The old builder returned "Overall compatibility is high across multiple
    // profile factors" here. Now: no invented strengths.
    const fullGroup: GroupProfile = { ...GROUP, memberLimit: 3, currentCount: 3 }
    const { strengths } = buildFitReasons(scoreGroup(EMPTY_CANDIDATE, fullGroup, EQUAL_WEIGHTS))

    expect(strengths).toEqual([])
  })
})
