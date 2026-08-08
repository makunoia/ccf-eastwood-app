import { describe, it, expect } from "vitest"
import { scoreGroup } from "@/lib/matching/engine"
import { EMPTY_CANDIDATE, type CandidateProfile, type GroupProfile } from "@/lib/matching/types"
import {
  DEFAULT_WEIGHTS,
  BREAKOUT_ACTIVE_WEIGHT_KEYS,
  ACTIVE_WEIGHT_KEYS,
} from "@/lib/validations/matching-weights"

/**
 * Breakout groups score a narrower set than DGroups: life stage and gender are
 * hard gates applied upstream, leaving language and age as the only weighted
 * factors. Work location, meeting format, work industry and capacity are DGroup
 * concerns that mean nothing for a table meeting once during an event.
 */

function candidate(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    ...EMPTY_CANDIDATE,
    language: ["English"],
    birthYear: new Date().getUTCFullYear() - 28,
    workCity: "Makati",
    workIndustry: "Tech",
    meetingPreference: "InPerson",
    ...overrides,
  }
}

function group(overrides: Partial<GroupProfile> = {}): GroupProfile {
  return {
    id: "g1",
    name: "Group",
    lifeStageIds: [],
    lifeStageNames: [],
    genderFocus: null,
    language: ["English"],
    ageRangeMin: 25,
    ageRangeMax: 35,
    meetingFormat: null,
    locationCity: null,
    memberLimit: null,
    currentCount: 0,
    memberIndustries: [],
    scheduleSlots: [],
    ...overrides,
  }
}

describe("scoreGroup with the breakout key set", () => {
  it("ignores work location, meeting format, industry and capacity entirely", () => {
    const c = candidate()
    const bare = group()
    const enriched = group({
      locationCity: "Cebu", // wrong city
      meetingFormat: "Online", // against an InPerson preference
      memberIndustries: ["Tech", "Tech", "Tech"], // three industry peers
      memberLimit: 4,
      currentCount: 3, // nearly full
    })

    const a = scoreGroup(c, bare, DEFAULT_WEIGHTS, BREAKOUT_ACTIVE_WEIGHT_KEYS)
    const b = scoreGroup(c, enriched, DEFAULT_WEIGHTS, BREAKOUT_ACTIVE_WEIGHT_KEYS)

    expect(b.totalScore).toBe(a.totalScore)
    expect(b.confidence).toBe(a.confidence)
  })

  it("does not ignore them for small groups — the same pair diverges", () => {
    const c = candidate()
    const a = scoreGroup(c, group(), DEFAULT_WEIGHTS, ACTIVE_WEIGHT_KEYS)
    const b = scoreGroup(
      c,
      group({ locationCity: "Cebu", meetingFormat: "Online" }),
      DEFAULT_WEIGHTS,
      ACTIVE_WEIGHT_KEYS
    )
    expect(b.totalScore).not.toBe(a.totalScore)
  })

  it("normalises over language and age alone", () => {
    // Perfect language, perfect age → a perfect breakout score, even though
    // every dropped factor is a miss or unknown.
    const result = scoreGroup(
      candidate(),
      group({ locationCity: "Cebu", meetingFormat: "Online" }),
      DEFAULT_WEIGHTS,
      BREAKOUT_ACTIVE_WEIGHT_KEYS
    )
    expect(result.totalScore).toBeCloseTo(1, 5)
  })

  it("counts confidence over the two factors only", () => {
    // Language measured, age not (no birth year, no bucket) → confidence is the
    // language share of language+age weight, not of all six.
    const result = scoreGroup(
      candidate({ birthYear: null, ageRange: null }),
      group(),
      DEFAULT_WEIGHTS,
      BREAKOUT_ACTIVE_WEIGHT_KEYS
    )
    const expected =
      DEFAULT_WEIGHTS.language / (DEFAULT_WEIGHTS.language + DEFAULT_WEIGHTS.age)
    expect(result.confidence).toBeCloseTo(expected, 5)
  })

  it("still reports every sub-score in the breakdown", () => {
    // Narrowing is about what carries weight, not about hiding data — the UI
    // decides what to render.
    const result = scoreGroup(candidate(), group(), DEFAULT_WEIGHTS, BREAKOUT_ACTIVE_WEIGHT_KEYS)
    expect(Object.keys(result.breakdown).sort()).toEqual(
      ["age", "capacity", "career", "gender", "language", "lifeStage", "location", "mode", "schedule"].sort()
    )
  })

  it("falls back to defaults on an all-zero config without dividing by zero", () => {
    const zeroed = { ...DEFAULT_WEIGHTS, language: 0, age: 0 }
    const result = scoreGroup(candidate(), group(), zeroed, BREAKOUT_ACTIVE_WEIGHT_KEYS)
    expect(Number.isFinite(result.totalScore)).toBe(true)
    // The fallback keeps the breakout key set — it must not silently start
    // scoring city and industry again.
    expect(result.totalScore).toBe(
      scoreGroup(candidate(), group(), DEFAULT_WEIGHTS, BREAKOUT_ACTIVE_WEIGHT_KEYS).totalScore
    )
  })

  it("defaults to the full small-group set when no keys are passed", () => {
    const c = candidate()
    const g = group({ locationCity: "Cebu" })
    expect(scoreGroup(c, g, DEFAULT_WEIGHTS).totalScore).toBe(
      scoreGroup(c, g, DEFAULT_WEIGHTS, ACTIVE_WEIGHT_KEYS).totalScore
    )
  })
})
