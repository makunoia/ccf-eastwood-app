import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"

/**
 * REVERSED — SmallGroup.leaderId is required again.
 *
 * This file used to assert the opposite: leaderId was made nullable and the
 * import wizard offered "Import without a leader — assign a leader later"
 * (LeaderResolution { type: "none" }), so a row that resolved no leader created a
 * leaderless group.
 *
 * That turned out to have a second, unintended effect: because the FK went to
 * ON DELETE SET NULL along with it, deleting any member silently stripped the
 * leader from every group they led, with nothing written to the group's log. The
 * decision was to restore the invariant — every DGroup has a leader — which means
 * the wizard option is gone and an unresolvable row is skipped instead.
 *
 * Kept rather than deleted so the reversal is legible: these tests now pin the
 * behaviour that replaced it, in the same place someone would look for the old one.
 * See also tests/integration/small-group-leader-required.test.ts for the database
 * constraint and the admin-facing refusal.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupLog", "SmallGroup", "Member", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(over: Partial<{ email: string; phone: string; firstName: string; lastName: string }> = {}) {
  return db.member.create({
    data: {
      firstName: over.firstName ?? "Leader",
      lastName: over.lastName ?? "Test",
      email: over.email ?? null,
      phone: over.phone ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

describe("Small Group import — a leader is required", () => {
  it("skips a row whose leader matches no member, instead of creating a leaderless group", async () => {
    const result = await importSmallGroups([
      {
        mapped: {
          name: "Leaderless Group",
          leaderEmail: "noone@nowhere.test",
          leaderMobile: "09170000000",
        },
        resolution: "use-csv",
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(0)
    expect(result.data.skipped).toBe(1)
    expect(result.data.errors[0]?.message).toContain("No leader found")

    expect(await db.smallGroup.findFirst({ where: { name: "Leaderless Group" } })).toBeNull()
    // Still no stray member invented for the unmatched leader.
    expect(await db.member.count()).toBe(0)
  })

  it("skips rather than creating a group named after a leader who doesn't exist", async () => {
    const result = await importSmallGroups([
      {
        mapped: {
          name: "",
          leaderFirstName: "Maria",
          leaderLastName: "Santos",
          leaderEmail: "maria.unmatched@test.com",
        },
        resolution: "use-csv",
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(0)
    expect(await db.smallGroup.findFirst({ where: { name: "Maria Santos Group" } })).toBeNull()
  })

  it("still requires a group name — a fully blank row is skipped", async () => {
    const result = await importSmallGroups([
      { mapped: { name: "" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(0)
    expect(result.data.skipped).toBe(1)
    expect(result.data.errors[0]?.message).toMatch(/name is required/i)
  })

  it("logs the handover when the CSV names a different leader", async () => {
    const outgoing = await seedMember({ email: "out@test.com", firstName: "Ella", lastName: "Santos" })
    const incoming = await seedMember({ email: "in@test.com", firstName: "Nina", lastName: "Reyes" })
    const existing = await db.smallGroup.create({
      data: { name: "Handover Group", leaderId: outgoing.id },
    })

    const result = await importSmallGroups([
      {
        mapped: { name: "Handover Group", leaderEmail: "in@test.com" },
        resolution: "use-csv",
        existingId: existing.id,
      },
    ])
    expect(result.success).toBe(true)

    const updated = await db.smallGroup.findUniqueOrThrow({ where: { id: existing.id } })
    expect(updated.leaderId).toBe(incoming.id)

    const logs = await db.smallGroupLog.findMany({ where: { smallGroupId: existing.id } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: "LeaderChanged", memberId: incoming.id })
    expect(logs[0].description).toBe(
      "Nina Reyes took over as leader from Ella Santos (CSV import)"
    )
  })

  it("writes no handover entry when the CSV names the leader already in place", async () => {
    const leader = await seedMember({ email: "same@test.com" })
    const existing = await db.smallGroup.create({
      data: { name: "Unchanged Group", leaderId: leader.id },
    })

    await importSmallGroups([
      {
        mapped: { name: "Unchanged Group", leaderEmail: "same@test.com", locationCity: "Pasig" },
        resolution: "use-csv",
        existingId: existing.id,
      },
    ])

    expect(await db.smallGroupLog.count({ where: { smallGroupId: existing.id } })).toBe(0)
  })

  it("never clears an existing group's leader, even when the CSV resolves none", async () => {
    const member = await seedMember({ email: "old@test.com" })
    const existing = await db.smallGroup.create({
      data: { name: "Existing Group", leaderId: member.id },
    })

    const result = await importSmallGroups([
      {
        mapped: { name: "Existing Group" },
        resolution: "use-csv",
        existingId: existing.id,
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(1)

    // The old behaviour set this to null; the group keeps its leader now.
    const updated = await db.smallGroup.findUnique({ where: { id: existing.id } })
    expect(updated?.leaderId).toBe(member.id)
  })
})

describe("regression: leader resolution still works", () => {
  it("links a pre-resolved existing member as leader", async () => {
    const member = await seedMember({ email: "lead@test.com" })

    const result = await importSmallGroups([
      { mapped: { name: "Linked Group" }, resolution: "use-csv", leaderId: member.id },
    ])

    expect(result.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "Linked Group" } })
    expect(group?.leaderId).toBe(member.id)
  })

  it("auto-resolves a leader by matching email in the CSV", async () => {
    const member = await seedMember({ email: "match@test.com" })

    const result = await importSmallGroups([
      { mapped: { name: "Auto Group", leaderEmail: "MATCH@test.com" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "Auto Group" } })
    expect(group?.leaderId).toBe(member.id)
  })

  it("creates a new member when createLeader is provided", async () => {
    const result = await importSmallGroups([
      {
        mapped: { name: "Created-Leader Group" },
        resolution: "use-csv",
        createLeader: {
          type: "create",
          firstName: "Juan",
          lastName: "Dela Cruz",
          email: "juan@test.com",
        },
      },
    ])

    expect(result.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "Created-Leader Group" } })
    expect(group?.leaderId).not.toBeNull()

    const newLeader = await db.member.findFirst({ where: { email: "juan@test.com" } })
    expect(group?.leaderId).toBe(newLeader?.id)
  })
})

describe("mixed batch", () => {
  it("imports the led groups and skips only the leaderless one", async () => {
    const member = await seedMember({ email: "boss@test.com" })

    const result = await importSmallGroups([
      { mapped: { name: "With Leader" }, resolution: "use-csv", leaderId: member.id },
      { mapped: { name: "Without Leader", leaderEmail: "ghost@test.com" }, resolution: "use-csv" },
      {
        mapped: { name: "Fresh Leader" },
        resolution: "use-csv",
        createLeader: { type: "create", firstName: "New", lastName: "Lead", email: "new@test.com" },
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    // One bad row doesn't cost the admin the other two.
    expect(result.data.created).toBe(2)
    expect(result.data.skipped).toBe(1)

    expect(await db.smallGroup.findFirst({ where: { name: "With Leader" } })).not.toBeNull()
    expect(await db.smallGroup.findFirst({ where: { name: "Fresh Leader" } })).not.toBeNull()
    expect(await db.smallGroup.findFirst({ where: { name: "Without Leader" } })).toBeNull()
  })
})
