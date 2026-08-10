import { searchTokens } from "@/lib/search/name-search"
import type { FormFieldKey, EventFormConfigData } from "@/lib/forms/context-config"

/**
 * Pure filtering for the breakout-group candidate picker.
 *
 * Client-safe on purpose: no React, no Prisma, no icon imports. The picker runs
 * these predicates over an already-fetched candidate list so filtering is
 * instant, and every branch here is unit-testable without a database.
 */

// ─── Limits ──────────────────────────────────────────────────────────────────

/**
 * Upper bound on one bulk placement. Far past any real breakout table (the
 * largest plausible `memberLimit` is a couple of dozen), but it stops an
 * unbounded array from turning one action call into an open-ended write loop.
 */
export const MAX_BREAKOUT_BATCH = 500

/**
 * Upper bound on the candidate pool shipped to the picker. Every candidate
 * carries a full demographic projection and a score, and each one costs a
 * scoring pass server-side, so an event with thousands of unassigned
 * registrants would otherwise turn opening the sheet into a slow, multi-MB
 * response. Past this the picker says so and leans on search.
 */
export const MAX_BREAKOUT_CANDIDATES = 1000

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type CandidateAgeBucket = {
  id: string
  label: string
  minAge: number | null
  maxAge: number | null
}

export type CandidateScheduleSlot = {
  dayOfWeek: number
  timeStart: string
  timeEnd: string
}

/** The attributes the picker can filter on, projected off the linked Member/Guest. */
export type CandidateDemographics = {
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  ageRangeBucket: CandidateAgeBucket | null
  workCity: string | null
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
  scheduleSlots: CandidateScheduleSlot[]
}

export type BreakoutCandidate = {
  registrantId: string
  name: string
  mobileNumber: string | null
  isMember: boolean
  /**
   * True when the registrant has neither a Member nor a Guest behind it — an
   * anonymous walk-in. Every demographic is null, so no attribute filter can
   * ever match them.
   */
  isAnonymous: boolean
  /**
   * Serving at this event — the member behind the registrant has a Volunteer
   * record on it that hasn't been rejected. Facilitators never reach the picker
   * (see `unassignedCandidateWhere`), but everyone else who signed up to serve
   * is a normal candidate, and an admin seating tables wants to see which.
   * Guests are always false: `Volunteer.memberId` is required.
   */
  isVolunteer: boolean
  demographics: CandidateDemographics
  score: number
  confidence: number
  passesGates: boolean
}

export type CandidateFilters = {
  search?: string
  lifeStageId?: string
  gender?: "Male" | "Female"
  /**
   * One age window, however it was expressed. Picking a bucket in the UI sets
   * these bounds from that bucket, so there is exactly one age rule — an
   * earlier revision had a separate bucket-id filter that ANDed with this one
   * and silently dropped anyone who gave a birth year but no bucket.
   */
  minAge?: number
  maxAge?: number
  /** Which bucket preset produced the window, purely so the select can show it. */
  ageBucketId?: string
  languages?: string[]
  workCity?: string
  meetingPreference?: "Online" | "Hybrid" | "InPerson"
  scheduleDayOfWeek?: number
  /**
   * Serving or not. Not an attribute filter: it is known for everyone, walk-ins
   * included, so it never drops someone for having no profile — see
   * `attributeFilterCount`.
   */
  role?: "participant" | "volunteer"
}

export const EMPTY_CANDIDATE_FILTERS: CandidateFilters = {}

// ─── Age ─────────────────────────────────────────────────────────────────────

/**
 * Age in whole years from a birth month + year.
 *
 * Month-aware: someone born in December is still the younger age for most of the
 * calendar year. When the month is unknown we assume the birthday has passed,
 * which matches how `lib/breakout-suggestion.ts` computes it.
 *
 * Note this deliberately does NOT reuse the matching engine's age math
 * (`scoreAgeDetailed` in lib/matching/scorers.ts), which works in fractional
 * years over 365.25 days. That function's output is pinned by tests and is used
 * for *scoring*; this one is used for *filtering*. They agree except within a
 * few days of a birthday.
 */
export function ageFromBirth(
  birthMonth: number | null,
  birthYear: number | null,
  now: Date = new Date()
): number | null {
  if (birthYear === null) return null
  let age = now.getFullYear() - birthYear
  if (birthMonth !== null && now.getMonth() + 1 < birthMonth) age -= 1
  return age
}

/**
 * Whether an age bucket overlaps a [min, max] window at all. Bucket bounds are
 * inclusive and either may be null (open-ended), as are the window bounds.
 *
 * Used when a candidate reported only a coarse bucket instead of a birth year:
 * "26 – 35" overlaps a 30+ filter, so they stay in rather than being dropped for
 * having answered the less precise question.
 */
export function bucketOverlapsRange(
  bucket: CandidateAgeBucket,
  minAge?: number,
  maxAge?: number
): boolean {
  if (minAge !== undefined && bucket.maxAge !== null && bucket.maxAge < minAge) return false
  if (maxAge !== undefined && bucket.minAge !== null && bucket.minAge > maxAge) return false
  return true
}

/**
 * Does this candidate fall in the requested age window?
 *
 * Birth year always wins — it's the matching engine's source of truth. Only when
 * it's absent do we fall back to the self-reported bucket, and then by overlap
 * rather than containment.
 */
function matchesAgeRange(
  d: CandidateDemographics,
  minAge: number | undefined,
  maxAge: number | undefined,
  now: Date
): boolean {
  const age = ageFromBirth(d.birthMonth, d.birthYear, now)
  if (age !== null) {
    if (minAge !== undefined && age < minAge) return false
    if (maxAge !== undefined && age > maxAge) return false
    return true
  }
  if (d.ageRangeBucket) return bucketOverlapsRange(d.ageRangeBucket, minAge, maxAge)
  return false
}

// ─── Work city ───────────────────────────────────────────────────────────────

/** Work city is free text — "Makati", "makati " and "MAKATI" are one place. */
export function normalizeCity(city: string): string {
  return city.trim().toLowerCase()
}

/**
 * Distinct cities in the pool, keyed by their folded form and displayed with the
 * most common casing. Ties break toward the capitalized spelling — "Makati"
 * reads better as a label than "makati", and fixing the direction keeps the
 * option list stable across renders.
 */
export function cityOptions(candidates: BreakoutCandidate[]): { value: string; label: string }[] {
  const spellings = new Map<string, Map<string, number>>()

  for (const c of candidates) {
    const raw = c.demographics.workCity?.trim()
    if (!raw) continue
    const key = normalizeCity(raw)
    const counts = spellings.get(key) ?? new Map<string, number>()
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
    spellings.set(key, counts)
  }

  return [...spellings.entries()]
    .map(([key, counts]) => {
      const label = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { caseFirst: "upper" })
      )[0][0]
      return { value: key, label }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Distinct languages present in the pool, alphabetically. */
export function languageOptions(candidates: BreakoutCandidate[]): string[] {
  const seen = new Set<string>()
  for (const c of candidates) for (const l of c.demographics.language) seen.add(l)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Every token must appear in the name or the mobile number. Tokenizing is what
 * makes "Santos Maria" find "Maria Santos" — the old single-substring test
 * required the query to be typed in exactly the stored order.
 */
function matchesSearch(c: BreakoutCandidate, query: string): boolean {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return true
  const haystack = `${c.name} ${c.mobileNumber ?? ""}`.toLowerCase()
  return tokens.every((t) => haystack.includes(t.toLowerCase()))
}

// ─── The filter ──────────────────────────────────────────────────────────────

/** True when an attribute filter is set (search and role don't count). */
export function hasAttributeFilters(f: CandidateFilters): boolean {
  return attributeFilterCount(f) > 0
}

/**
 * How many filters can only be answered from a profile.
 *
 * Kept apart from `activeFilterCount` because the picker uses this one to decide
 * whether anyone was dropped for having no profile at all. Role is known for
 * everyone — an anonymous walk-in is simply a participant — so folding it in
 * here would list a walk-in under "N hidden — no profile info" while it is also
 * sitting in the main results.
 */
export function attributeFilterCount(f: CandidateFilters): number {
  return [
    f.lifeStageId,
    f.gender,
    // The bucket id is only a label for the window, never a rule of its own.
    f.minAge !== undefined || f.maxAge !== undefined ? "age" : undefined,
    f.languages && f.languages.length > 0 ? "lang" : undefined,
    f.workCity,
    f.meetingPreference,
    f.scheduleDayOfWeek !== undefined ? "sched" : undefined,
  ].filter((v) => v !== undefined).length
}

/** Everything the "N filters" chip should count, role included. */
export function activeFilterCount(f: CandidateFilters): number {
  return attributeFilterCount(f) + (f.role !== undefined ? 1 : 0)
}

/**
 * Apply every set filter. Filters AND together; multi-valued filters (language)
 * OR within themselves.
 *
 * Anonymous registrants match no attribute filter by construction — they have no
 * profile to match against. The picker surfaces them separately as "N hidden —
 * no profile info" rather than letting them vanish silently, which is the same
 * principle as `buildRows`' "a value is never hidden" rule in
 * lib/forms/registration-responses.ts.
 */
export function filterBreakoutCandidates(
  candidates: BreakoutCandidate[],
  filters: CandidateFilters,
  now: Date = new Date()
): BreakoutCandidate[] {
  return candidates.filter((c) => {
    if (filters.search && !matchesSearch(c, filters.search)) return false

    // Before the attribute filters: this one is answerable for everyone,
    // including the anonymous walk-ins the rest of them can't speak to.
    if (filters.role === "volunteer" && !c.isVolunteer) return false
    if (filters.role === "participant" && c.isVolunteer) return false

    const d = c.demographics

    if (filters.lifeStageId !== undefined && d.lifeStageId !== filters.lifeStageId) return false
    if (filters.gender !== undefined && d.gender !== filters.gender) return false

    // Birth year first, self-reported bucket only as a fallback. Someone who
    // answered the precise question is never dropped for not having also
    // answered the coarse one.
    if (
      (filters.minAge !== undefined || filters.maxAge !== undefined) &&
      !matchesAgeRange(d, filters.minAge, filters.maxAge, now)
    ) {
      return false
    }

    if (filters.languages !== undefined && filters.languages.length > 0) {
      if (!filters.languages.some((l) => d.language.includes(l))) return false
    }

    if (filters.workCity !== undefined) {
      const city = d.workCity ? normalizeCity(d.workCity) : null
      if (city !== filters.workCity) return false
    }

    if (
      filters.meetingPreference !== undefined &&
      d.meetingPreference !== filters.meetingPreference
    ) {
      return false
    }

    // Members hold several availability slots, guests exactly one. Any overlap counts.
    if (filters.scheduleDayOfWeek !== undefined) {
      if (!d.scheduleSlots.some((s) => s.dayOfWeek === filters.scheduleDayOfWeek)) return false
    }

    return true
  })
}

// ─── Which filters to render ─────────────────────────────────────────────────

/** The filter controls the picker can render, one per underlying form field. */
export type CandidateFilterKey =
  | "lifeStage"
  | "gender"
  | "age"
  | "language"
  | "workCity"
  | "meetingPreference"
  | "schedule"

const FILTER_SOURCE: Record<
  CandidateFilterKey,
  { fields: FormFieldKey[]; hasValue: (d: CandidateDemographics) => boolean }
> = {
  lifeStage: { fields: ["fieldLifeStage"], hasValue: (d) => d.lifeStageId !== null },
  gender: { fields: ["fieldGender"], hasValue: (d) => d.gender !== null },
  // One control fed by either question: birth date is the precise source, the
  // bucket the coarse one, and the filter reads whichever a person answered.
  age: {
    fields: ["fieldBirthDate", "fieldAgeRange"],
    hasValue: (d) => d.birthYear !== null || d.ageRangeBucket !== null,
  },
  language: { fields: ["fieldLanguage"], hasValue: (d) => d.language.length > 0 },
  workCity: { fields: ["fieldWorkCity"], hasValue: (d) => Boolean(d.workCity?.trim()) },
  meetingPreference: {
    fields: ["fieldMeetingPreference"],
    hasValue: (d) => d.meetingPreference !== null,
  },
  schedule: { fields: ["fieldSchedule"], hasValue: (d) => d.scheduleSlots.length > 0 },
}

export const CANDIDATE_FILTER_KEYS = Object.keys(FILTER_SOURCE) as CandidateFilterKey[]

/**
 * Which filters to show for this event.
 *
 * A filter appears when the event's merged form config collects that field, OR
 * when anyone in the pool actually holds a value for it. The second half matters
 * because form config governs what the form *asks* — a returning Member already
 * carries a gender on their profile even if this event's form never asked. This
 * mirrors `buildRows` in lib/forms/registration-responses.ts, whose rule is that
 * an answer that exists is never hidden.
 *
 * The converse also holds: a field the form collects but nobody answered still
 * shows, so an admin isn't left wondering where a filter went.
 */
export function visibleFilters(
  config: EventFormConfigData,
  candidates: BreakoutCandidate[]
): CandidateFilterKey[] {
  return CANDIDATE_FILTER_KEYS.filter((key) => {
    const { fields, hasValue } = FILTER_SOURCE[key]
    if (fields.some((f) => config[f])) return true
    return candidates.some((c) => hasValue(c.demographics))
  })
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export type CandidateSort = "fit" | "name" | "recent"

export const CANDIDATE_SORT_LABELS: Record<CandidateSort, string> = {
  fit: "Best fit",
  name: "Name",
  recent: "Recently registered",
}

/**
 * `recent` relies on the server returning candidates in registration order, so
 * it reverses the incoming array rather than sorting on a date we'd otherwise
 * have to ship to the client.
 */
export function sortCandidates(
  candidates: BreakoutCandidate[],
  sort: CandidateSort
): BreakoutCandidate[] {
  const copy = [...candidates]
  switch (sort) {
    case "fit":
      // Gate-failers sink below everyone eligible regardless of raw score;
      // confidence breaks ties so a 70% built on real data outranks a guess.
      return copy.sort(
        (a, b) =>
          Number(b.passesGates) - Number(a.passesGates) ||
          b.score - a.score ||
          b.confidence - a.confidence
      )
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case "recent":
      return copy.reverse()
  }
}
