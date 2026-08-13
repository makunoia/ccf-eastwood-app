import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"

/**
 * Every DGroup requires a leader (SmallGroup.leaderId is NOT NULL). These tests
 * don't care who it is, so each group gets a throwaway member. The leader has no
 * smallGroupId of their own, so they never count toward a group's roster.
 */
let __leaderSeq = 0
async function aLeader(): Promise<string> {
  const m = await db.member.create({
    data: {
      firstName: `Leader${++__leaderSeq}`,
      lastName: "Seed",
      dateJoined: new Date(),
      language: [],
    },
    select: { id: true },
  })
  return m.id
}


/**
 * A group can't be created without a leader, so every row names one the importer
 * can resolve — this member, matched by email.
 */
const LEADER_EMAIL = "csv.leader@example.com"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member", "LifeStage", "BreakoutGroup", "Event" RESTART IDENTITY CASCADE`
  await db.member.create({
    data: {
      firstName: "Csv",
      lastName: "Leader",
      email: LEADER_EMAIL,
      dateJoined: new Date(),
      language: [],
    },
  })
})

afterAll(async () => {
  await db.$disconnect()
})

function row(
  mapped: Record<string, string>,
  overrides: Partial<{ resolution: "use-existing" | "use-csv" | "create-new"; existingId: string }> = {}
) {
  return {
    // Leader column supplied by default — these tests are about groupType, not
    // leader resolution, and a row without a resolvable leader is now skipped.
    mapped: { leaderEmail: LEADER_EMAIL, ...mapped },
    resolution: overrides.resolution ?? ("create-new" as const),
    ...(overrides.existingId ? { existingId: overrides.existingId } : {}),
  }
}

describe("small group CSV import — Group Type column", () => {
  it("creates a Couples group and forces genderFocus to Mixed even when the CSV says Male", async () => {
    const result = await importSmallGroups([
      row({ name: "Couples Alpha", groupType: "Couples", genderFocus: "Male" }),
    ])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(1)

    const group = await db.smallGroup.findFirst({ where: { name: "Couples Alpha" } })
    expect(group?.groupType).toBe("Couples")
    expect(group?.genderFocus).toBe("Mixed")
  })

  it("accepts case-insensitive values and the singular 'couple'", async () => {
    const result = await importSmallGroups([
      row({ name: "G1", groupType: "couples" }),
      row({ name: "G2", groupType: "COUPLE" }),
      row({ name: "G3", groupType: "regular" }),
    ])
    expect(result.success).toBe(true)

    const [g1, g2, g3] = await Promise.all([
      db.smallGroup.findFirst({ where: { name: "G1" } }),
      db.smallGroup.findFirst({ where: { name: "G2" } }),
      db.smallGroup.findFirst({ where: { name: "G3" } }),
    ])
    expect(g1?.groupType).toBe("Couples")
    expect(g2?.groupType).toBe("Couples")
    expect(g3?.groupType).toBe("Regular")
  })

  it("defaults to Regular when the column is blank or unparseable", async () => {
    const result = await importSmallGroups([
      row({ name: "Blank Type" }),
      row({ name: "Bad Type", groupType: "sportsfest" }),
    ])
    expect(result.success).toBe(true)

    const [blank, bad] = await Promise.all([
      db.smallGroup.findFirst({ where: { name: "Blank Type" } }),
      db.smallGroup.findFirst({ where: { name: "Bad Type" } }),
    ])
    expect(blank?.groupType).toBe("Regular")
    expect(bad?.groupType).toBe("Regular")
  })

  it("skips a new group whose leader can't be resolved, and says why", async () => {
    const result = await importSmallGroups([
      { mapped: { name: "Orphan" }, resolution: "create-new" },
      row({ name: "Fine" }),
    ])
    expect(result.success).toBe(true)
    if (!result.success) return

    // A group with no leader is not a row the importer can honour — it skips
    // rather than creating one, and the rest of the file still imports.
    expect(result.data.created).toBe(1)
    expect(result.data.skipped).toBe(1)
    expect(result.data.errors[0].message).toContain("No leader found")
    expect(await db.smallGroup.findFirst({ where: { name: "Orphan" } })).toBeNull()
    expect(await db.smallGroup.findFirst({ where: { name: "Fine" } })).not.toBeNull()
  })

  it("use-csv: a blank leader cell keeps the group's existing leader", async () => {
    const incumbent = await aLeader()
    const existing = await db.smallGroup.create({
      data: { name: "Has A Leader", leaderId: incumbent },
      select: { id: true },
    })

    const result = await importSmallGroups([
      {
        mapped: { name: "Has A Leader", locationCity: "Pasig" },
        resolution: "use-csv",
        existingId: existing.id,
      },
    ])
    expect(result.success).toBe(true)

    // CSV wins on every other column, but never to the point of leaving no leader.
    const updated = await db.smallGroup.findUniqueOrThrow({ where: { id: existing.id } })
    expect(updated.leaderId).toBe(incumbent)
    expect(updated.locationCity).toBe("Pasig")
  })

  it("use-csv: a blank cell never downgrades an existing Couples group and keeps focus Mixed", async () => {
    const existing = await db.smallGroup.create({
      data: { leaderId: await aLeader(), name: "Married Ones", groupType: "Couples", genderFocus: "Mixed" },
    })

    const result = await importSmallGroups([
      row(
        { name: "Married Ones", genderFocus: "Female" }, // no groupType column
        { resolution: "use-csv", existingId: existing.id }
      ),
    ])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(1)

    const updated = await db.smallGroup.findUnique({ where: { id: existing.id } })
    expect(updated?.groupType).toBe("Couples")
    expect(updated?.genderFocus).toBe("Mixed") // CSV's Female overridden by couples rule
  })

  it("use-csv: an explicit Regular downgrades (CSV wins) and gender focus applies", async () => {
    const existing = await db.smallGroup.create({
      data: { leaderId: await aLeader(), name: "Was Couples", groupType: "Couples", genderFocus: "Mixed" },
    })

    const result = await importSmallGroups([
      row(
        { name: "Was Couples", groupType: "Regular", genderFocus: "Female" },
        { resolution: "use-csv", existingId: existing.id }
      ),
    ])
    expect(result.success).toBe(true)

    const updated = await db.smallGroup.findUnique({ where: { id: existing.id } })
    expect(updated?.groupType).toBe("Regular")
    expect(updated?.genderFocus).toBe("Female")
  })

  it("use-existing (enrich): upgrades Regular → Couples but never downgrades Couples → Regular", async () => {
    const regular = await db.smallGroup.create({
      data: { leaderId: await aLeader(), name: "Upgrade Me", groupType: "Regular", genderFocus: "Male" },
    })
    const couples = await db.smallGroup.create({
      data: { leaderId: await aLeader(), name: "Keep Me", groupType: "Couples", genderFocus: "Mixed" },
    })

    const result = await importSmallGroups([
      row(
        { name: "Upgrade Me", groupType: "Couples" },
        { resolution: "use-existing", existingId: regular.id }
      ),
      row(
        { name: "Keep Me", groupType: "Regular" },
        { resolution: "use-existing", existingId: couples.id }
      ),
    ])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(2)

    const [upgraded, kept] = await Promise.all([
      db.smallGroup.findUnique({ where: { id: regular.id } }),
      db.smallGroup.findUnique({ where: { id: couples.id } }),
    ])
    expect(upgraded?.groupType).toBe("Couples")
    expect(upgraded?.genderFocus).toBe("Mixed") // forced on upgrade
    expect(kept?.groupType).toBe("Couples")
    expect(kept?.genderFocus).toBe("Mixed")
  })
})
