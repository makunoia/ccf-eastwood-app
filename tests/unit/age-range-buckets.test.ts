import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import {
  DEFAULT_AGE_RANGE_BUCKETS,
  LEGACY_AGE_RANGE_REMAP,
  bucketForAge,
} from "@/lib/constants/age-range-buckets"

/**
 * CCF-144 — the ten-band Age Range taxonomy.
 *
 * The bands are seeded by SQL but described in TypeScript, so these cover both
 * halves: that the bands themselves partition every age, and that the migration
 * actually writes the bands this file claims.
 */

/** Labels contain `+` and en-dashes, so they can't go into a RegExp verbatim. */
function escapeRe(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const MIGRATION_SQL = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260807010000_age_range_buckets_v2/migration.sql"
  ),
  "utf-8"
)

describe("DEFAULT_AGE_RANGE_BUCKETS", () => {
  it("has the ten bands in order, with unique labels", () => {
    expect(DEFAULT_AGE_RANGE_BUCKETS).toHaveLength(10)
    expect(DEFAULT_AGE_RANGE_BUCKETS.map((b) => b.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    const labels = DEFAULT_AGE_RANGE_BUCKETS.map((b) => b.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("is open-ended at both ends and closed everywhere between", () => {
    const first = DEFAULT_AGE_RANGE_BUCKETS[0]
    const last = DEFAULT_AGE_RANGE_BUCKETS[DEFAULT_AGE_RANGE_BUCKETS.length - 1]
    expect(first.minAge).toBeNull()
    expect(last.maxAge).toBeNull()
    for (const b of DEFAULT_AGE_RANGE_BUCKETS.slice(1, -1)) {
      expect(b.minAge).not.toBeNull()
      expect(b.maxAge).not.toBeNull()
    }
  })

  it("puts every age 0–120 in exactly one band", () => {
    for (let age = 0; age <= 120; age++) {
      const hits = DEFAULT_AGE_RANGE_BUCKETS.filter(
        (b) => (b.minAge === null || age >= b.minAge) && (b.maxAge === null || age <= b.maxAge)
      )
      expect(hits, `age ${age} matched ${hits.length} bands`).toHaveLength(1)
    }
  })

  it.each([
    [12, "Under 13"],
    [13, "13–20"],
    [20, "13–20"],
    [21, "21–30"],
    [30, "21–30"],
    [31, "31–40"],
    // The boundary Mark's original list double-counted: 81–90 followed by 90+
    // claimed 90 twice, so the ninth band was narrowed to 81–89.
    [89, "81–89"],
    [90, "90+"],
    [91, "90+"],
  ])("age %i falls in %s", (age, label) => {
    expect(bucketForAge(age)?.label).toBe(label)
  })
})

describe("LEGACY_AGE_RANGE_REMAP", () => {
  it("covers all six retired bands", () => {
    expect(LEGACY_AGE_RANGE_REMAP.map((r) => r.from)).toEqual([
      "Under 18",
      "18 – 29",
      "30 – 39",
      "40 – 49",
      "50 – 59",
      "60+",
    ])
  })

  it("only ever targets a band that exists", () => {
    const labels = new Set(DEFAULT_AGE_RANGE_BUCKETS.map((b) => b.label))
    for (const { from, to } of LEGACY_AGE_RANGE_REMAP) {
      expect(labels.has(to), `${from} → ${to} is not a real band`).toBe(true)
    }
  })

  it("never maps an old band onto one that no longer exists as a source", () => {
    // A remap target that is itself a retired label would leave the second run
    // of the migration moving people twice.
    const retired = new Set(LEGACY_AGE_RANGE_REMAP.map((r) => r.from))
    for (const { to } of LEGACY_AGE_RANGE_REMAP) {
      expect(retired.has(to)).toBe(false)
    }
  })
})

/**
 * The migration SQL is the thing that actually runs; these constants are what
 * everything else reasons about. Nothing keeps them in step but this test.
 */
describe("migration SQL agrees with the constants", () => {
  it("inserts exactly the ten bands, with matching bounds and order", () => {
    for (const { label, minAge, maxAge, order } of DEFAULT_AGE_RANGE_BUCKETS) {
      const row = new RegExp(
        `'${escapeRe(label)}',\\s*(NULL|\\d+),\\s*(NULL|\\d+),\\s*(\\d+),`
      ).exec(MIGRATION_SQL)
      expect(row, `no INSERT row for ${label}`).not.toBeNull()
      expect(row![1]).toBe(minAge === null ? "NULL" : String(minAge))
      expect(row![2]).toBe(maxAge === null ? "NULL" : String(maxAge))
      expect(row![3]).toBe(String(order))
    }
  })

  it("remaps and then deletes exactly the six retired labels", () => {
    for (const { from, to } of LEGACY_AGE_RANGE_REMAP) {
      expect(MIGRATION_SQL).toContain(`['${from}',`)
      expect(
        new RegExp(`\\['${escapeRe(from)}',\\s*'${escapeRe(to)}'\\]`).test(MIGRATION_SQL),
        `${from} → ${to} is not the mapping the migration writes`
      ).toBe(true)
    }
    const deleteClause = /DELETE FROM "AgeRangeBucket"\s*\nWHERE "label" IN \(([^)]*)\)/.exec(
      MIGRATION_SQL
    )
    expect(deleteClause).not.toBeNull()
    for (const { from } of LEGACY_AGE_RANGE_REMAP) {
      expect(deleteClause![1]).toContain(`'${from}'`)
    }
  })

  it("stays idempotent — conflict-tolerant insert, no bare CREATE/ALTER", () => {
    expect(MIGRATION_SQL).toContain('ON CONFLICT ("label") DO NOTHING')
    expect(MIGRATION_SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
  })
})
