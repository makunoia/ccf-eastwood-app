/**
 * Personal/matching fields, selected identically for Member and Guest.
 *
 * Shared so every surface that resolves "who is this person" — the cluster
 * export, the single-event export — reads the same columns. A select that drifts
 * between them is how two exports of the same person end up disagreeing.
 */
export const PERSON_PROFILE_SELECT = {
  nickname: true,
  email: true,
  phone: true,
  gender: true,
  birthMonth: true,
  birthYear: true,
  workCity: true,
  language: true,
  meetingPreference: true,
  lifeStage: { select: { name: true } },
  ageRangeBucket: { select: { label: true } },
} as const
