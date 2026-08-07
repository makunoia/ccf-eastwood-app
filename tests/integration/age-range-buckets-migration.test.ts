import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  DEFAULT_AGE_RANGE_BUCKETS,
  LEGACY_AGE_RANGE_REMAP,
} from "@/lib/constants/age-range-buckets"

/**
 * CCF-144 — the Age Range migration, executed for real.
 *
 * The suite truncates `AgeRangeBucket` between runs, so asserting against the
 * rows the migration left behind at deploy time is not reliable. Instead each
 * test seeds the *old* world and runs the migration's own SQL over it, which
 * tests the thing that matters: that a database sitting on the six 18-and-up
 * bands ends up on the ten new ones with nobody stranded.
 */

const MIGRATION_SQL = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260807010000_age_range_buckets_v2/migration.sql"
  ),
  "utf-8"
)

/** The six bands seeded by `20260727010000_add_age_range_bucket`. */
const LEGACY_BUCKETS = [
  { label: "Under 18", minAge: null, maxAge: 17, order: 1 },
  { label: "18 – 29", minAge: 18, maxAge: 29, order: 2 },
  { label: "30 – 39", minAge: 30, maxAge: 39, order: 3 },
  { label: "40 – 49", minAge: 40, maxAge: 49, order: 4 },
  { label: "50 – 59", minAge: 50, maxAge: 59, order: 5 },
  { label: "60+", minAge: 60, maxAge: null, order: 6 },
]

async function runMigration() {
  await db.$executeRawUnsafe(MIGRATION_SQL)
}

async function seedLegacyBuckets() {
  await db.ageRangeBucket.createMany({ data: LEGACY_BUCKETS })
}

async function labelFor(bucketId: string | null): Promise<string | null> {
  if (!bucketId) return null
  const row = await db.ageRangeBucket.findUnique({
    where: { id: bucketId },
    select: { label: true },
  })
  return row?.label ?? null
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "AgeRangeBucket" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("age range buckets v2 migration", () => {
  it("replaces the six legacy bands with the ten new ones", async () => {
    await seedLegacyBuckets()
    await runMigration()

    const rows = await db.ageRangeBucket.findMany({ orderBy: { order: "asc" } })
    expect(rows.map((r) => ({ label: r.label, minAge: r.minAge, maxAge: r.maxAge, order: r.order })))
      .toEqual(DEFAULT_AGE_RANGE_BUCKETS.map((b) => ({ ...b })))
  })

  it("moves every member and guest onto the band their old one overlapped most", async () => {
    await seedLegacyBuckets()
    const legacy = await db.ageRangeBucket.findMany()
    const byLabel = new Map(legacy.map((b) => [b.label, b.id]))

    // One member and one guest per retired band, so both FK columns are covered.
    for (const { from } of LEGACY_AGE_RANGE_REMAP) {
      await db.member.create({
        data: {
          firstName: "M",
          lastName: from,
          dateJoined: new Date(),
          language: [],
          ageRangeBucketId: byLabel.get(from)!,
        },
      })
      await db.guest.create({
        data: { firstName: "G", lastName: from, language: [], ageRangeBucketId: byLabel.get(from)! },
      })
    }

    await runMigration()

    for (const { from, to } of LEGACY_AGE_RANGE_REMAP) {
      const member = await db.member.findFirst({ where: { lastName: from } })
      const guest = await db.guest.findFirst({ where: { lastName: from } })
      expect(await labelFor(member!.ageRangeBucketId), `member on ${from}`).toBe(to)
      expect(await labelFor(guest!.ageRangeBucketId), `guest on ${from}`).toBe(to)
    }
  })

  it("leaves no dangling ageRangeBucketId behind", async () => {
    await seedLegacyBuckets()
    const legacy = await db.ageRangeBucket.findMany()
    for (const bucket of legacy) {
      await db.member.create({
        data: {
          firstName: "M",
          lastName: bucket.label,
          dateJoined: new Date(),
          language: [],
          ageRangeBucketId: bucket.id,
        },
      })
    }

    await runMigration()

    const liveIds = new Set((await db.ageRangeBucket.findMany()).map((b) => b.id))
    const members = await db.member.findMany({ select: { ageRangeBucketId: true } })
    expect(members).toHaveLength(LEGACY_BUCKETS.length)
    for (const m of members) {
      expect(m.ageRangeBucketId).not.toBeNull()
      expect(liveIds.has(m.ageRangeBucketId!)).toBe(true)
    }
  })

  it("is idempotent — a second run changes nothing", async () => {
    await seedLegacyBuckets()
    await runMigration()
    const first = await db.ageRangeBucket.findMany({ orderBy: { order: "asc" } })

    await runMigration()
    const second = await db.ageRangeBucket.findMany({ orderBy: { order: "asc" } })

    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id))
    expect(second).toHaveLength(10)
  })

  it("runs cleanly on a database that never had the legacy bands", async () => {
    // A fresh install: the remap loop finds nothing to move, the DELETE matches
    // nothing, and the ten bands are simply created.
    await runMigration()
    const rows = await db.ageRangeBucket.findMany({ orderBy: { order: "asc" } })
    expect(rows.map((r) => r.label)).toEqual(DEFAULT_AGE_RANGE_BUCKETS.map((b) => b.label))
  })

  it("keeps a bucket an admin created themselves", async () => {
    await db.ageRangeBucket.create({
      data: { label: "Staff only", minAge: 25, maxAge: 45, order: 99 },
    })
    await runMigration()

    const custom = await db.ageRangeBucket.findUnique({ where: { label: "Staff only" } })
    expect(custom).not.toBeNull()
    expect(custom!.order).toBe(99)
  })
})
