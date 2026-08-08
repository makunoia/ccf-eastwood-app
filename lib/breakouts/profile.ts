/**
 * The one answer a breakout group's detail page owes an admin: what does this
 * group match for?
 *
 * A breakout group matches on four things — life stage, gender focus, language
 * and age range. They are hand-entered on the group itself and always editable.
 * They used to be a *copy* of the facilitator's DGroup, taken on assignment,
 * which locked the form and sent admins to the DGroup page to change anything;
 * a breakout table is not its facilitator's DGroup, so that coupling is gone.
 * The facilitator's DGroup is still shown, as information (see
 * `components/breakouts/facilitator-leadership.tsx`) and still routes Catch Mech
 * requests via `BreakoutGroup.linkedSmallGroupId` — but it no longer decides
 * what this group matches for.
 *
 * Client-safe on purpose: no React, no Prisma, no icon imports — the detail page
 * card, both edit drawers and the server action all import from here, and every
 * branch is unit-testable without a database.
 */

// ─── Labels ──────────────────────────────────────────────────────────────────

export const GENDER_FOCUS_LABELS: Record<string, string> = {
  Male: "Male",
  Female: "Female",
  Mixed: "Mixed",
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

/**
 * The criteria a breakout group matches on. Meeting format, location city and
 * meeting schedule are deliberately absent: a breakout table meets once, during
 * the event, at the venue — those are DGroup properties that were carried over
 * and never meant anything here.
 */
export type BreakoutMatchingProfile = {
  lifeStages: { id: string; name: string }[]
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
}

/** The same criteria as the edit drawers hold them: strings, `""` for unset. */
export type ProfileFormValues = {
  lifeStageIds: string[]
  genderFocus: string
  language: string[]
  ageRangeMin: string
  ageRangeMax: string
}

// ─── Timothy ─────────────────────────────────────────────────────────────────

/**
 * A facilitator who leads no DGroup yet ("Timothy") must fill the profile in:
 * it seeds the DGroup created for them when their first member is confirmed, so
 * unlike an ordinary breakout group there is nothing to fall back on.
 *
 * Shared by both edit drawers and `validateTimothyProfile` on the server so the
 * client can't accept what the action will reject. Returns the missing field
 * labels, in form order — empty means valid.
 */
export function missingTimothyFields(profile: {
  lifeStageIds?: string[]
  genderFocus?: string | null
  language?: string[]
  ageRangeMin?: number | string | null
  ageRangeMax?: number | string | null
}): string[] {
  const missing: string[] = []
  const isBlank = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === ""

  if (!profile.lifeStageIds || profile.lifeStageIds.length === 0) missing.push("Life Stage")
  if (!profile.genderFocus) missing.push("Gender Focus")
  if (!profile.language || profile.language.length === 0) missing.push("Language")
  // Both bounds: this seeds a DGroup's age range, and a range with one open end
  // isn't one. The two form inputs make that cheap to satisfy.
  if (isBlank(profile.ageRangeMin) || isBlank(profile.ageRangeMax)) missing.push("Age Range")

  return missing
}

// ─── Display ─────────────────────────────────────────────────────────────────

/**
 * True when there is nothing worth rendering. Drives the profile card's empty
 * state — a group with no criteria set shows one sentence rather than a row of
 * "Any" tiles.
 */
export function isProfileEmpty(profile: BreakoutMatchingProfile): boolean {
  return (
    profile.lifeStages.length === 0 &&
    !profile.genderFocus &&
    profile.language.length === 0 &&
    profile.ageRangeMin == null &&
    profile.ageRangeMax == null
  )
}

/**
 * The profile as label/value rows, in a fixed order, with unset factors shown as
 * "Any" rather than dropped — an admin needs to tell "matches everyone" apart
 * from "nobody filled this in", and the empty state already covers the case
 * where *nothing* is set.
 *
 * `key` is the matching factor each row belongs to, so the card can pull the
 * factor's icon and colour from `FIELD_META` without a second lookup table.
 */
export function profileRows(
  profile: BreakoutMatchingProfile
): { key: "lifeStage" | "gender" | "language" | "age"; label: string; value: string }[] {
  return [
    {
      key: "lifeStage",
      label: "Life Stage",
      value:
        profile.lifeStages.length > 0
          ? profile.lifeStages.map((ls) => ls.name).join(", ")
          : "Any",
    },
    {
      key: "gender",
      label: "Gender Focus",
      value: profile.genderFocus
        ? (GENDER_FOCUS_LABELS[profile.genderFocus] ?? profile.genderFocus)
        : "Any",
    },
    {
      key: "language",
      label: "Language",
      value: profile.language.length > 0 ? profile.language.join(", ") : "Any",
    },
    {
      key: "age",
      label: "Age Range",
      value: formatAgeRange(profile.ageRangeMin, profile.ageRangeMax),
    },
  ]
}

/** "25–35 yrs", "25+ yrs", "Up to 35 yrs", "Any". */
export function formatAgeRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max} yrs`
  if (min != null) return `${min}+ yrs`
  if (max != null) return `Up to ${max} yrs`
  return "Any"
}
