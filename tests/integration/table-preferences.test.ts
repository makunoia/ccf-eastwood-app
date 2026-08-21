import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db"
import { resetTablePreference, saveTablePreference } from "@/lib/tables/actions"
import { DEFAULT_TABLE_PREFERENCE } from "@/lib/tables/preferences"

/**
 * The write half of saved table layouts.
 *
 * The point of interest is scoping: the action takes no `userId`, because the
 * only layout anyone may write is their own. These tests pin that a second
 * user's row is never touched, and that a repeat save updates rather than
 * duplicating (the `@@unique([userId, tableKey])` doing its job).
 */

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth }))

async function seedUser(username: string) {
  return db.user.create({
    data: { username, name: username, role: "SuperAdmin" },
  })
}

function signedInAs(userId: string) {
  auth.mockResolvedValue({ user: { id: userId, role: "SuperAdmin" } })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "UserTablePreference", "User" RESTART IDENTITY CASCADE`
  auth.mockReset()
})

afterAll(async () => {
  await db.$disconnect()
})

describe("saveTablePreference", () => {
  it("stores a layout for the signed-in user", async () => {
    const user = await seedUser("admin-a")
    signedInAs(user.id)

    const result = await saveTablePreference("members", {
      hidden: ["email"],
      shown: ["gender"],
      order: ["phone", "email"],
      density: "Compact",
    })

    expect(result.success).toBe(true)
    const saved = await db.userTablePreference.findUnique({
      where: { userId_tableKey: { userId: user.id, tableKey: "members" } },
    })
    expect(saved?.hidden).toEqual(["email"])
    expect(saved?.shown).toEqual(["gender"])
    expect(saved?.order).toEqual(["phone", "email"])
    expect(saved?.density).toBe("Compact")
  })

  it("updates the existing row rather than adding a second one", async () => {
    const user = await seedUser("admin-b")
    signedInAs(user.id)

    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["phone"] })

    const rows = await db.userTablePreference.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].hidden).toEqual(["phone"])
  })

  it("keeps each table's layout separate", async () => {
    const user = await seedUser("admin-c")
    signedInAs(user.id)

    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    await saveTablePreference("guests", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["lifeStage"] })

    const rows = await db.userTablePreference.findMany({
      where: { userId: user.id },
      orderBy: { tableKey: "asc" },
    })
    expect(rows.map((r) => [r.tableKey, r.hidden])).toEqual([
      ["guests", ["lifeStage"]],
      ["members", ["email"]],
    ])
  })

  it("never writes over another user's layout for the same table", async () => {
    const [one, two] = [await seedUser("admin-d"), await seedUser("admin-e")]

    signedInAs(one.id)
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    signedInAs(two.id)
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["phone"] })

    const rows = await db.userTablePreference.findMany({ orderBy: { hidden: "asc" } })
    expect(rows).toHaveLength(2)
    expect(
      rows.find((r) => r.userId === one.id)?.hidden,
    ).toEqual(["email"])
    expect(
      rows.find((r) => r.userId === two.id)?.hidden,
    ).toEqual(["phone"])
  })

  it("refuses an unauthenticated caller", async () => {
    auth.mockResolvedValue(null)

    const result = await saveTablePreference("members", DEFAULT_TABLE_PREFERENCE)

    expect(result).toEqual({ success: false, error: "Not authenticated." })
    expect(await db.userTablePreference.count()).toBe(0)
  })

  it("rejects a malformed layout without writing", async () => {
    const user = await seedUser("admin-f")
    signedInAs(user.id)

    const result = await saveTablePreference("members", {
      hidden: [],
      shown: [],
      order: [],
      // Not one of the two densities the column picker can produce.
      density: "Roomy" as never,
    })

    expect(result.success).toBe(false)
    expect(await db.userTablePreference.count()).toBe(0)
  })

  it("goes away with the user", async () => {
    const user = await seedUser("admin-g")
    signedInAs(user.id)
    await saveTablePreference("members", DEFAULT_TABLE_PREFERENCE)

    await db.user.delete({ where: { id: user.id } })

    expect(await db.userTablePreference.count()).toBe(0)
  })
})

describe("resetTablePreference", () => {
  it("drops the row so the table falls back to its defaults", async () => {
    const user = await seedUser("admin-h")
    signedInAs(user.id)
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })

    const result = await resetTablePreference("members")

    expect(result.success).toBe(true)
    expect(await db.userTablePreference.count()).toBe(0)
  })

  it("leaves other tables and other users alone", async () => {
    const [one, two] = [await seedUser("admin-i"), await seedUser("admin-j")]
    signedInAs(one.id)
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    await saveTablePreference("guests", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    signedInAs(two.id)
    await saveTablePreference("members", { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })

    signedInAs(one.id)
    await resetTablePreference("members")

    const remaining = await db.userTablePreference.findMany()
    expect(remaining).toHaveLength(2)
    expect(remaining.some((r) => r.userId === one.id && r.tableKey === "guests")).toBe(true)
    expect(remaining.some((r) => r.userId === two.id && r.tableKey === "members")).toBe(true)
  })

  it("refuses an unauthenticated caller", async () => {
    auth.mockResolvedValue(null)
    expect(await resetTablePreference("members")).toEqual({
      success: false,
      error: "Not authenticated.",
    })
  })
})
