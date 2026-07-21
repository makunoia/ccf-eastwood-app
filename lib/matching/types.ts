export type TimeSlot = {
  dayOfWeek: number // 0 = Sunday … 6 = Saturday
  timeStart: string // "HH:MM"
  timeEnd: string   // "HH:MM"
}

export type CandidateProfile = {
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
  scheduleSlots: TimeSlot[] // 0-or-1 slot for Guests (stored as inline fields on Guest)
}

export const EMPTY_CANDIDATE: CandidateProfile = {
  lifeStageId: null,
  gender: null,
  language: [],
  birthMonth: null,
  birthYear: null,
  workCity: null,
  workIndustry: null,
  meetingPreference: null,
  scheduleSlots: [],
}

export type GroupProfile = {
  id: string
  name: string
  lifeStageIds: string[]
  lifeStageNames: string[]
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  locationCity: string | null
  memberLimit: number | null
  currentCount: number
  memberIndustries: string[] // workIndustry of all current group members
  scheduleSlots: TimeSlot[]
}

/**
 * The group-side facts the match breakdown UI needs, projected off GroupProfile.
 *
 * Deliberately NOT the full GroupProfile: `memberIndustries[]` is collapsed to
 * `industryPeerCount` (how many current members share the candidate's industry)
 * so no member roster leaks — this rides on MatchResult, which is serialized to
 * the unauthenticated public join page via JoinMatchResult.
 */
export type GroupSummary = {
  lifeStageNames: string[]
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  locationCity: string | null
  memberLimit: number | null
  currentCount: number
  industryPeerCount: number
  scheduleSlots: TimeSlot[]
}

export type ScoreBreakdown = {
  lifeStage: number
  gender: number
  language: number
  age: number
  schedule: number
  location: number
  mode: number
  career: number
  capacity: number
}

export type WeightConfig = ScoreBreakdown

/** Per-factor flag: was the factor actually measured, or is its score a
 *  neutral placeholder because one side had no data? */
export type ScoreCoverage = Record<keyof ScoreBreakdown, boolean>

export type MatchResult = {
  groupId: string
  groupName: string
  totalScore: number
  breakdown: ScoreBreakdown
  coverage: ScoreCoverage
  /** Share of active weight backed by measured factors (0–1). A high score
   *  built entirely on unknowns has low confidence; used as a ranking
   *  tie-breaker and surfaced in the UI. */
  confidence: number
  groupSummary: GroupSummary
  candidateProfile: CandidateProfile
  // True when the group recently received a guest assignment and is only shown
  // because no other eligible groups remain (cooldown fallback).
  onCooldown?: boolean
}

export type EscalationLevel = {
  level: 1 | 2 | 3
  source: "breakout-facilitator" | "event-volunteer" | "all-small-groups"
  matches: MatchResult[]
}
