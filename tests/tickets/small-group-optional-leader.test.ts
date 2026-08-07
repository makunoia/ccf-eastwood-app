import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"

// Latest change: SmallGroup.leaderId is now nullable. The import wizard offers an
// "Import without a leader" option (LeaderResolution { type: "none" }), which the
// wizard maps to an ImportRow with NEITHER leaderId NOR createLeader set.
// Previously, importSmallGroups skipped any row that could not resolve a leader.

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member", "LifeStage" RESTART IDENTITY CASCADE`
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

describe("Small Group import — optional leader", () => {
  describe("new behavior: import without a leader", () => {
    it("creates a group with null leaderId when no leader is resolved (the 'none' choice)", async () => {
      // Wizard 'none' resolution → row has no leaderId and no createLeader.
      // Leader fields in `mapped` come from the CSV but match no existing member.
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
      expect(result.data.created).toBe(1)
      expect(result.data.skipped).toBe(0)
      expect(result.data.errors).toHaveLength(0)

      const group = await db.smallGroup.findFirst({ where: { name: "Leaderless Group" } })
      expect(group).not.toBeNull()
      expect(group?.leaderId).toBeNull()

      // No stray member was created for the unmatched leader.
      expect(await db.member.count()).toBe(0)
    })

    it("auto-generates the group name from leader names even when imported without a leader", async () => {
      // Blank name + leader name present in mapped → name becomes "<Leader> Group".
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
      expect(result.data.created).toBe(1)

      const group = await db.smallGroup.findFirst({ where: { name: "Maria Santos Group" } })
      expect(group).not.toBeNull()
      expect(group?.leaderId).toBeNull()
    })

    it("still requires a group name — a fully blank row without leader is skipped", async () => {
      const result = await importSmallGroups([
        { mapped: { name: "" }, resolution: "use-csv" },
      ])

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.created).toBe(0)
      expect(result.data.skipped).toBe(1)
      expect(result.data.errors[0]?.message).toMatch(/name is required/i)
    })
  })

  describe("regression: leader resolution still works", () => {
    it("links a pre-resolved existing member as leader", async () => {
      const member = await seedMember({ email: "lead@test.com" })

      const result = await importSmallGroups([
        {
          mapped: { name: "Linked Group" },
          resolution: "use-csv",
          leaderId: member.id, // wizard 'link' resolution
        },
      ])

      expect(result.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { name: "Linked Group" } })
      expect(group?.leaderId).toBe(member.id)
    })

    it("auto-resolves a leader by matching email in the CSV", async () => {
      const member = await seedMember({ email: "match@test.com" })

      const result = await importSmallGroups([
        {
          mapped: { name: "Auto Group", leaderEmail: "MATCH@test.com" },
          resolution: "use-csv",
        },
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
      expect(newLeader).not.toBeNull()
      expect(group?.leaderId).toBe(newLeader?.id)
    })
  })

  describe("mixed batch", () => {
    it("imports leaderless and led groups together without skipping the leaderless ones", async () => {
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
      expect(result.data.created).toBe(3)
      expect(result.data.skipped).toBe(0)
      expect(result.data.errors).toHaveLength(0)

      const withLeader = await db.smallGroup.findFirst({ where: { name: "With Leader" } })
      const withoutLeader = await db.smallGroup.findFirst({ where: { name: "Without Leader" } })
      const freshLeader = await db.smallGroup.findFirst({ where: { name: "Fresh Leader" } })

      expect(withLeader?.leaderId).toBe(member.id)
      expect(withoutLeader?.leaderId).toBeNull()
      expect(freshLeader?.leaderId).not.toBeNull()
    })
  })

  describe("update path", () => {
    it("can clear a leader by updating an existing group with no resolved leader", async () => {
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

      const updated = await db.smallGroup.findUnique({ where: { id: existing.id } })
      expect(updated?.leaderId).toBeNull()
    })
  })
})
