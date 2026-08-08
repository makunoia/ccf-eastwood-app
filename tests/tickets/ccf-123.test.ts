import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { AGE_DECAY_YEARS, scoreAgeDetailed } from "@/lib/matching/scorers"
import {
  ageRangeBucketSchema,
  formatAgeRange,
} from "@/lib/validations/age-range-bucket"
import {
  createAgeRangeBucket,
  updateAgeRangeBucket,
  deleteAgeRangeBucket,
} from "@/app/(dashboard)/settings/age-ranges/actions"

/**
 * CCF-123 — configurable Age Range buckets.
 *
 *  - unit:        the age scorer's bucket fallback, validation, label formatting
 *  - integration: Settings CRUD
 *  - regression:  birth year always wins over a bucket; deleting a bucket must
 *                 not delete the people who selected it
 *  - edge case:   open-ended buckets, inverted bounds, both-bounds-empty
 */

const CURRENT_YEAR = new Date().getFullYear()

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "AgeRangeBucket", "Guest", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-123 unit — age scorer bucket fallback", () => {
  it("ignores the bucket entirely when birth year is present", async () => {
    // A 35-year-old whose bucket says 60+ still scores as 35 — birth year wins.
    const birthYear = CURRENT_YEAR - 35
    const withBucket = scoreAgeDetailed(6, birthYear, 30, 39, { minAge: 60, maxAge: null })
    const withoutBucket = scoreAgeDetailed(6, birthYear, 30, 39, null)

    expect(withBucket).toEqual(withoutBucket)
    expect(withBucket.score).toBe(1.0)
    expect(withBucket.known).toBe(true)
  })

  it("falls back to the bucket when birth year is absent", () => {
    const result = scoreAgeDetailed(null, null, 30, 39, { minAge: 30, maxAge: 39 })
    expect(result.score).toBe(1.0)
    expect(result.known).toBe(true)
  })

  it("stays unknown when there is neither a birth year nor a bucket", () => {
    const result = scoreAgeDetailed(null, null, 30, 39, null)
    expect(result).toEqual({ score: 0.5, known: false })
  })

  it("stays unknown when the group has no age range at all", () => {
    expect(scoreAgeDetailed(null, null, null, null, { minAge: 30, maxAge: 39 })).toEqual({
      score: 0.5,
      known: false,
    })
  })

  it("scores a partial overlap as a full match", () => {
    // 18–29 against a group wanting 25–35 overlaps at 25–29.
    expect(scoreAgeDetailed(null, null, 25, 35, { minAge: 18, maxAge: 29 }).score).toBe(1.0)
  })

  it("decays with the gap when the bucket sits outside the group range", () => {
    // Bucket 18–29 vs group 34–40 → gap of 5 years.
    const result = scoreAgeDetailed(null, null, 34, 40, { minAge: 18, maxAge: 29 })
    expect(result.score).toBeCloseTo(1 - 5 / AGE_DECAY_YEARS, 5)
    expect(result.known).toBe(true)
  })

  it("floors at zero once the gap exceeds the decay window", () => {
    // Bucket "Under 18" vs a 60+ group.
    expect(scoreAgeDetailed(null, null, 60, null, { minAge: null, maxAge: 17 }).score).toBe(0)
  })

  it("handles an open-ended upper bucket (60+)", () => {
    expect(scoreAgeDetailed(null, null, 60, null, { minAge: 60, maxAge: null }).score).toBe(1.0)
    expect(scoreAgeDetailed(null, null, 18, 29, { minAge: 60, maxAge: null }).score).toBe(0)
  })

  it("handles an open-ended lower bucket (Under 18)", () => {
    expect(scoreAgeDetailed(null, null, 13, 17, { minAge: null, maxAge: 17 }).score).toBe(1.0)
  })

  it("treats a bucket with both bounds empty as unknown", () => {
    expect(scoreAgeDetailed(null, null, 30, 39, { minAge: null, maxAge: null })).toEqual({
      score: 0.5,
      known: false,
    })
  })
})

describe("CCF-123 unit — validation and formatting", () => {
  it("accepts an open-ended lower bound", () => {
    const parsed = ageRangeBucketSchema.safeParse({
      label: "Under 18",
      minAge: "",
      maxAge: "17",
      order: "1",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.minAge).toBeNull()
  })

  it("accepts an open-ended upper bound", () => {
    const parsed = ageRangeBucketSchema.safeParse({
      label: "60+",
      minAge: "60",
      maxAge: "",
      order: "6",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.maxAge).toBeNull()
  })

  it("rejects a bucket with no bounds at all", () => {
    const parsed = ageRangeBucketSchema.safeParse({
      label: "Any",
      minAge: "",
      maxAge: "",
      order: "1",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects inverted bounds", () => {
    const parsed = ageRangeBucketSchema.safeParse({
      label: "Backwards",
      minAge: "50",
      maxAge: "20",
      order: "1",
    })
    expect(parsed.success).toBe(false)
  })

  it("formats open-ended and closed ranges readably", () => {
    expect(formatAgeRange(null, 17)).toBe("Under 18")
    expect(formatAgeRange(18, 29)).toBe("18 – 29")
    expect(formatAgeRange(60, null)).toBe("60+")
    expect(formatAgeRange(null, null)).toBe("Any age")
  })
})

describe("CCF-123 integration — Settings CRUD", () => {
  it("creates a bucket", async () => {
    const result = await createAgeRangeBucket({
      label: "30 – 39",
      minAge: "30",
      maxAge: "39",
      order: "3",
    })
    expect(result.success).toBe(true)

    const row = await db.ageRangeBucket.findUnique({ where: { label: "30 – 39" } })
    expect(row?.minAge).toBe(30)
    expect(row?.maxAge).toBe(39)
    expect(row?.order).toBe(3)
  })

  it("rejects a duplicate label", async () => {
    await createAgeRangeBucket({ label: "18 – 29", minAge: "18", maxAge: "29", order: "2" })
    const second = await createAgeRangeBucket({
      label: "18 – 29",
      minAge: "18",
      maxAge: "29",
      order: "9",
    })
    expect(second.success).toBe(false)
    if (!second.success) expect(second.error).toMatch(/already exists/i)
  })

  it("updates a bucket's bounds", async () => {
    const created = await createAgeRangeBucket({
      label: "Young",
      minAge: "18",
      maxAge: "29",
      order: "1",
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const result = await updateAgeRangeBucket(created.data.id, {
      label: "Young",
      minAge: "20",
      maxAge: "34",
      order: "1",
    })
    expect(result.success).toBe(true)

    const row = await db.ageRangeBucket.findUnique({ where: { id: created.data.id } })
    expect(row?.minAge).toBe(20)
    expect(row?.maxAge).toBe(34)
  })

  it("rejects an invalid update", async () => {
    const created = await createAgeRangeBucket({
      label: "Range",
      minAge: "18",
      maxAge: "29",
      order: "1",
    })
    if (!created.success) throw new Error("seed failed")

    const result = await updateAgeRangeBucket(created.data.id, {
      label: "Range",
      minAge: "50",
      maxAge: "20",
      order: "1",
    })
    expect(result.success).toBe(false)
  })

  it("deletes a bucket", async () => {
    const created = await createAgeRangeBucket({
      label: "Temp",
      minAge: "18",
      maxAge: "29",
      order: "1",
    })
    if (!created.success) throw new Error("seed failed")

    expect((await deleteAgeRangeBucket(created.data.id)).success).toBe(true)
    expect(await db.ageRangeBucket.count()).toBe(0)
  })
})

describe("CCF-123 regression — deleting a bucket must not delete people", () => {
  it("clears the reference and keeps the guest", async () => {
    const created = await createAgeRangeBucket({
      label: "30 – 39",
      minAge: "30",
      maxAge: "39",
      order: "3",
    })
    if (!created.success) throw new Error("seed failed")

    const guest = await db.guest.create({
      data: {
        firstName: "Ella",
        lastName: "Santos",
        language: [],
        ageRangeBucketId: created.data.id,
      },
      select: { id: true },
    })

    expect((await deleteAgeRangeBucket(created.data.id)).success).toBe(true)

    const after = await db.guest.findUnique({
      where: { id: guest.id },
      select: { id: true, ageRangeBucketId: true },
    })
    expect(after).not.toBeNull()
    expect(after?.ageRangeBucketId).toBeNull()
  })

  it("clears the reference and keeps the member", async () => {
    const created = await createAgeRangeBucket({
      label: "40 – 49",
      minAge: "40",
      maxAge: "49",
      order: "4",
    })
    if (!created.success) throw new Error("seed failed")

    const member = await db.member.create({
      data: {
        firstName: "Rico",
        lastName: "Tan",
        dateJoined: new Date(),
        language: [],
        ageRangeBucketId: created.data.id,
      },
      select: { id: true },
    })

    await deleteAgeRangeBucket(created.data.id)

    const after = await db.member.findUnique({
      where: { id: member.id },
      select: { id: true, ageRangeBucketId: true },
    })
    expect(after).not.toBeNull()
    expect(after?.ageRangeBucketId).toBeNull()
  })
})
