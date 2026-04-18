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
    lifeStage: scoreLifeStage(candidate.lifeStageId, group.lifeStageId),
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
  }
}
