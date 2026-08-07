/**
 * The Age Range taxonomy shipped by default (CCF-144).
 *
 * `AgeRangeBucket` is a Settings-managed table, so this is a *seed*, not a
 * source of truth at runtime — an admin can rename, retune or delete any band
 * afterwards. It lives here rather than only inside the migration SQL so the
 * boundary coverage can be asserted by a unit test, and so the integration test
 * can compare the real post-migration table against the intended shape.
 *
 * Bounds are inclusive on both sides (see `lib/validations/age-range-bucket.ts`):
 * a null `minAge` reads as "and under", a null `maxAge` as "and over", which is
 * how the first and last bands stay open-ended.
 *
 * The list replaces the six 18-and-up bands seeded by
 * `20260727010000_add_age_range_bucket` — see `LEGACY_AGE_RANGE_REMAP`.
 */

export type AgeRangeBucketSeed = {
  label: string
  minAge: number | null
  maxAge: number | null
  order: number
}

/**
 * Ten bands, contiguous from 0 upward with no overlap and no gap.
 *
 * Mark's original list ran "81–90" then "90+", which double-counts age 90 and
 * makes bucket assignment ambiguous. Resolved by narrowing the ninth band to
 * 81–89 so "90+" can mean literally that.
 */
export const DEFAULT_AGE_RANGE_BUCKETS: readonly AgeRangeBucketSeed[] = [
  { label: "Under 13", minAge: null, maxAge: 12, order: 1 },
  { label: "13–20", minAge: 13, maxAge: 20, order: 2 },
  { label: "21–30", minAge: 21, maxAge: 30, order: 3 },
  { label: "31–40", minAge: 31, maxAge: 40, order: 4 },
  { label: "41–50", minAge: 41, maxAge: 50, order: 5 },
  { label: "51–60", minAge: 51, maxAge: 60, order: 6 },
  { label: "61–70", minAge: 61, maxAge: 70, order: 7 },
  { label: "71–80", minAge: 71, maxAge: 80, order: 8 },
  { label: "81–89", minAge: 81, maxAge: 89, order: 9 },
  { label: "90+", minAge: 90, maxAge: null, order: 10 },
]

/**
 * Where people assigned to a retired band are moved.
 *
 * Every old band straddles a new boundary, so no remap is exact; each old label
 * maps to the new band it overlaps most, which is the only rule here that is
 * both deterministic and defensible. `Under 18` overlaps `Under 13` by 13 years
 * against 5 for `13–20`; the four middle bands each overlap their new
 * near-namesake by 9 years against 1; `60+` overlaps `61–70` by 10 against 1
 * for `51–60`.
 *
 * Keys are the exact labels seeded by `20260727010000_add_age_range_bucket`,
 * spaced en-dash included. A label an admin has since renamed simply won't
 * match, and the migration leaves that bucket alone.
 */
export const LEGACY_AGE_RANGE_REMAP: readonly { from: string; to: string }[] = [
  { from: "Under 18", to: "Under 13" },
  { from: "18 – 29", to: "21–30" },
  { from: "30 – 39", to: "31–40" },
  { from: "40 – 49", to: "41–50" },
  { from: "50 – 59", to: "51–60" },
  { from: "60+", to: "61–70" },
]

/** The band an age falls in, or null if the list somehow doesn't cover it. */
export function bucketForAge(
  age: number,
  buckets: readonly AgeRangeBucketSeed[] = DEFAULT_AGE_RANGE_BUCKETS
): AgeRangeBucketSeed | null {
  return (
    buckets.find(
      (b) => (b.minAge === null || age >= b.minAge) && (b.maxAge === null || age <= b.maxAge)
    ) ?? null
  )
}
