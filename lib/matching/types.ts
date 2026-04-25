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
  lifeStageId: string | null
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

export type MatchResult = {
  groupId: string
  groupName: string
  totalScore: number
  breakdown: ScoreBreakdown
  candidateProfile: CandidateProfile
}

export type EscalationLevel = {
  level: 1 | 2 | 3
  source: "breakout-facilitator" | "event-volunteer" | "all-small-groups"
  matches: MatchResult[]
}
