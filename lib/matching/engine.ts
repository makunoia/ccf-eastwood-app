import type {
  CandidateProfile,
  GroupProfile,
  MatchResult,
  ScoreBreakdown,
  ScoreCoverage,
  WeightConfig,
} from "./types"
import {
  scoreLifeStageDetailed,
  scoreGenderDetailed,
  scoreLanguageDetailed,
  scoreAgeDetailed,
  scoreScheduleDetailed,
  scoreLocationDetailed,
  scoreModeDetailed,
  scoreCareerDetailed,
  scoreCapacityDetailed,
} from "./scorers"
import { ACTIVE_WEIGHT_KEYS, DEFAULT_WEIGHTS } from "@/lib/validations/matching-weights"

export function scoreGroup(
  candidate: CandidateProfile,
  group: GroupProfile,
  weights: WeightConfig
): MatchResult {
  const factors = {
    lifeStage: scoreLifeStageDetailed(candidate.lifeStageId, group.lifeStageIds),
    gender:    scoreGenderDetailed(candidate.gender, group.genderFocus),
    language:  scoreLanguageDetailed(candidate.language, group.language),
    age:       scoreAgeDetailed(candidate.birthMonth, candidate.birthYear, group.ageRangeMin, group.ageRangeMax),
    schedule:  scoreScheduleDetailed(candidate.scheduleSlots, group.scheduleSlots),
    location:  scoreLocationDetailed(candidate.workCity, group.locationCity),
    mode:      scoreModeDetailed(candidate.meetingPreference, group.meetingFormat),
    career:    scoreCareerDetailed(candidate.workIndustry, group.memberIndustries),
    capacity:  scoreCapacityDetailed(group.memberLimit, group.currentCount),
  }

  const breakdown = Object.fromEntries(
    Object.entries(factors).map(([k, v]) => [k, v.score])
  ) as ScoreBreakdown
  const coverage = Object.fromEntries(
    Object.entries(factors).map(([k, v]) => [k, v.known])
  ) as ScoreCoverage

  // Only the active (non-gate) factors carry weight — gates are hard filters
  // applied upstream, so weighting them would do nothing. Normalise by the
  // active weight actually present so a config that zeroes some factors still
  // produces a 0–1 score.
  let weightedSum = 0
  let activeWeightTotal = 0
  let knownWeight = 0
  for (const key of ACTIVE_WEIGHT_KEYS) {
    const w = weights[key]
    activeWeightTotal += w
    weightedSum += factors[key].score * w
    if (factors[key].known) knownWeight += w
  }

  // Degenerate config (all active weights zero) — fall back to defaults rather
  // than divide by zero.
  if (activeWeightTotal <= 0) {
    return scoreGroup(candidate, group, DEFAULT_WEIGHTS)
  }

  const totalScore = weightedSum / activeWeightTotal
  const confidence = knownWeight / activeWeightTotal

  const industryPeerCount = candidate.workIndustry
    ? group.memberIndustries.filter((i) => i === candidate.workIndustry).length
    : 0

  return {
    groupId:   group.id,
    groupName: group.name,
    totalScore,
    breakdown,
    coverage,
    confidence,
    groupSummary: {
      lifeStageNames: group.lifeStageNames,
      genderFocus: group.genderFocus,
      language: group.language,
      ageRangeMin: group.ageRangeMin,
      ageRangeMax: group.ageRangeMax,
      meetingFormat: group.meetingFormat,
      locationCity: group.locationCity,
      memberLimit: group.memberLimit,
      currentCount: group.currentCount,
      industryPeerCount,
      scheduleSlots: group.scheduleSlots,
    },
    candidateProfile: candidate,
  }
}

export type CoupleScore = {
  /** Ranking score: the WORSE spouse's score — a couples placement is only as
   *  good as its fit for the less-well-matched spouse. */
  combinedScore: number
  /** Tie-breaker between groups with equal combinedScore. */
  averageScore: number
  scoreA: number
  scoreB: number
}

/**
 * Combines two spouses' individual scores for the same group into a joint
 * couple score. Worst-of (min) semantics: a group that fits one spouse
 * perfectly but the other poorly is a bad couples placement.
 */
export function combineCoupleScores(scoreA: number, scoreB: number): CoupleScore {
  return {
    combinedScore: Math.min(scoreA, scoreB),
    averageScore: (scoreA + scoreB) / 2,
    scoreA,
    scoreB,
  }
}
