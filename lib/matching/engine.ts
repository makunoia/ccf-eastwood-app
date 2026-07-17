import type { CandidateProfile, GroupProfile, MatchResult, ScoreBreakdown, WeightConfig } from "./types"
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
} from "./scorers"

export function scoreGroup(
  candidate: CandidateProfile,
  group: GroupProfile,
  weights: WeightConfig
): MatchResult {
  const breakdown: ScoreBreakdown = {
    lifeStage: scoreLifeStage(candidate.lifeStageId, group.lifeStageIds),
    gender:    scoreGender(candidate.gender, group.genderFocus),
    language:  scoreLanguage(candidate.language, group.language),
    age:       scoreAge(candidate.birthMonth, candidate.birthYear, group.ageRangeMin, group.ageRangeMax),
    schedule:  scoreSchedule(candidate.scheduleSlots, group.scheduleSlots),
    location:  scoreLocation(candidate.workCity, group.locationCity),
    mode:      scoreMode(candidate.meetingPreference, group.meetingFormat),
    career:    scoreCareer(candidate.workIndustry, group.memberIndustries),
    capacity:  scoreCapacity(group.memberLimit, group.currentCount),
  }

  const totalScore =
    breakdown.lifeStage * weights.lifeStage +
    breakdown.gender    * weights.gender    +
    breakdown.language  * weights.language  +
    breakdown.age       * weights.age       +
    breakdown.schedule  * weights.schedule  +
    breakdown.location  * weights.location  +
    breakdown.mode      * weights.mode      +
    breakdown.career    * weights.career    +
    breakdown.capacity  * weights.capacity

  return {
    groupId:    group.id,
    groupName:  group.name,
    totalScore,
    breakdown,
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
