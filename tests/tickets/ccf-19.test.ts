import { describe, it, expect } from "vitest"
import { buildFitReasons } from "@/components/small-group-match-card"
import { scoreGroup } from "@/lib/matching/engine"
import type { CandidateProfile, GroupProfile, WeightConfig, MatchResult } from "@/lib/matching/types"
import { EMPTY_CANDIDATE } from "@/lib/matching/types"

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
  lifeStageIds: ["ls-yp"],
  lifeStageNames: ["Young Professionals"],
  genderFocus: "Mixed",
  language: ["Filipino"],
  ageRangeMin: 25,
  ageRangeMax: 35,
  meetingFormat: "Hybrid",
  locationCity: "Makati",
  memberLimit: 10,
  currentCount: 3,
  memberIndustries: ["Tech", "Finance"],
  scheduleSlots: [{ dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" }],
}

/** Every reason string across both buckets — a factor is "mentioned" if it
 *  appears as either a strength or a consideration. */
function allReasons(result: MatchResult): string[] {
  const { strengths, considerations } = buildFitReasons(result)
  return [...strengths, ...considerations]
}
const mentions = (result: MatchResult, phrase: string) =>
  allReasons(result).some((r) => r.toLowerCase().includes(phrase))

/**
 * CCF-19: Only reason about profile fields that are present in the profile.
 * A missing field must appear in NEITHER bucket — it is unknown, not a
 * strength and not a concern. (The full breakdown grid shows unknowns
 * separately, but that is admin-only and not part of these prose reasons.)
 */
describe("CCF-19", () => {
  describe("unit — unmeasured factors are never reasoned about", () => {
    it("no life-stage reason when candidate has no lifeStageId", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, lifeStageId: null, language: ["Filipino"] }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "life stage")).toBe(false)
    })

    it("shows a life-stage strength when candidate's life stage matches", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, lifeStageId: "ls-yp" }
      const { strengths } = buildFitReasons(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS))
      expect(strengths.some((r) => r.toLowerCase().includes("life stage"))).toBe(true)
    })

    it("no language reason when candidate has no languages", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, language: [] }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "language")).toBe(false)
    })

    it("shows a language strength when candidate language overlaps", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, language: ["Filipino"] }
      const { strengths } = buildFitReasons(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS))
      expect(strengths.some((r) => r.toLowerCase().includes("language"))).toBe(true)
    })

    it("no schedule reason when candidate has no schedule slots", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, scheduleSlots: [] }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "schedule")).toBe(false)
    })

    it("no location reason when candidate has no workCity", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, workCity: null }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "area")).toBe(false)
    })

    it("no industry reason when candidate has no workIndustry", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, workIndustry: null }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "industry")).toBe(false)
    })

    it("no meeting-format reason when candidate has no meetingPreference", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, meetingPreference: null }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "meeting format")).toBe(false)
    })

    it("no age reason when candidate has no birth data", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, birthMonth: null, birthYear: null }
      expect(mentions(scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS), "age")).toBe(false)
    })
  })

  describe("unit — honest counterweight (the #8 fix)", () => {
    it("surfaces a poor factor as a consideration rather than hiding it", () => {
      // English-only candidate against a Filipino-only group → language is a
      // measured mismatch, so it must appear as a consideration.
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, language: ["English"] }
      const { strengths, considerations } = buildFitReasons(
        scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS)
      )
      expect(considerations.some((r) => r.toLowerCase().includes("language"))).toBe(true)
      expect(strengths.some((r) => r.toLowerCase().includes("language"))).toBe(false)
    })

    it("REGRESSION: a low-scoring match never claims broad compatibility", () => {
      // The old fallback said "compatibility is high across multiple factors"
      // for exactly this kind of empty/weak match. It must not anymore.
      const fullGroup: GroupProfile = { ...BASE_GROUP, memberLimit: 3, currentCount: 3 }
      const reasons = allReasons(scoreGroup(EMPTY_CANDIDATE, fullGroup, EQUAL_WEIGHTS))
      expect(reasons.some((r) => r.toLowerCase().includes("compatibility is high"))).toBe(false)
    })
  })

  describe("regression — empty candidate", () => {
    it("reasons about no profile-derived factor for an empty candidate", () => {
      const result = scoreGroup(EMPTY_CANDIDATE, BASE_GROUP, EQUAL_WEIGHTS)
      const profilePhrases = [
        "life stage", "language", "schedule", "meeting format",
        "gender", "area", "age", "industry",
      ]
      for (const phrase of profilePhrases) {
        expect(mentions(result, phrase), `"${phrase}" should not appear for an empty candidate`).toBe(false)
      }
    })

    it("MatchResult still carries candidateProfile from scoreGroup", () => {
      const candidate: CandidateProfile = { ...EMPTY_CANDIDATE, workCity: "Makati", gender: "Female" }
      const result = scoreGroup(candidate, BASE_GROUP, EQUAL_WEIGHTS)
      expect(result.candidateProfile).toEqual(candidate)
    })
  })
})
