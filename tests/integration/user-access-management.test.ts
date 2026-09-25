import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { updateUserPermissions } from "@/app/(dashboard)/settings/users/actions"

/**
 * Integration coverage for Settings → Users access edits.
 * Browser coverage is skipped: the dialog is a thin form over this server action,
 * while these assertions prove the persisted permissions and event scope.
 */
beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "User", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedStaff() {
  return db.user.create({
    data: { username: "staff", name: "Staff Account", role: "Staff" },
  })
}

async function seedEvent(name = "Sunday Service") {
  const date = new Date("2026-09-13T00:00:00.000Z")
  return db.event.create({
    data: { name, type: "OneTime", startDate: date, endDate: date },
  })
}

describe("updateUserPermissions", () => {
  it("replaces a staff account's feature privileges and event scope", async () => {
    const staff = await seedStaff()
    const event = await seedEvent()

    const result = await updateUserPermissions(staff.id, {
      username: "staff",
      role: "Staff",
      permissions: [
        { feature: "Members", actions: ["Read", "Write"] },
        { feature: "Events", actions: ["Read", "Export"] },
      ],
      eventIds: [event.id],
    })

    expect(result).toEqual({ success: true, data: undefined })
    const refreshed = await db.user.findUniqueOrThrow({
      where: { id: staff.id },
      include: { permissions: true, eventAccess: true },
    })
    expect(refreshed.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "Members", action: "Read" }),
        expect.objectContaining({ feature: "Members", action: "Write" }),
        expect.objectContaining({ feature: "Events", action: "Read" }),
        expect.objectContaining({ feature: "Events", action: "Export" }),
      ])
    )
    expect(refreshed.permissions).toHaveLength(4)
    expect(refreshed.eventAccess.map(({ eventId }) => eventId)).toEqual([event.id])
  })

  it("can promote a Staff user to Super Admin and update their username and access", async () => {
    const admin = await db.user.create({
      data: { username: "staff", name: "Admin", role: "Staff" },
    })

    await expect(updateUserPermissions(admin.id, {
      username: "admin-updated",
      role: "SuperAdmin",
      permissions: [{ feature: "Members", actions: ["Read"] }],
      eventIds: [],
    })).resolves.toEqual({ success: true, data: undefined })
    const updated = await db.user.findUniqueOrThrow({
      where: { id: admin.id },
      include: { permissions: true },
    })
    expect(updated.username).toBe("admin-updated")
    expect(updated.role).toBe("SuperAdmin")
    expect(updated.permissions).toHaveLength(1)
  })

  it("can demote a Super Admin and assign Staff permissions", async () => {
    const admin = await db.user.create({
      data: { username: "admin", name: "Admin", role: "SuperAdmin" },
    })

    await expect(updateUserPermissions(admin.id, {
      username: "admin",
      role: "Staff",
      permissions: [{ feature: "Guests", actions: ["Read"] }],
      eventIds: [],
    })).resolves.toEqual({ success: true, data: undefined })
    const updated = await db.user.findUniqueOrThrow({
      where: { id: admin.id },
      include: { permissions: true },
    })
    expect(updated.role).toBe("Staff")
    expect(updated.permissions).toEqual([
      expect.objectContaining({ feature: "Guests", action: "Read" }),
    ])
  })

  it("can change an existing Super Admin's username and stored feature access", async () => {
    const admin = await db.user.create({
      data: { username: "admin", name: "Admin", role: "SuperAdmin" },
    })

    await expect(updateUserPermissions(admin.id, {
      username: "renamed-admin",
      role: "SuperAdmin",
      permissions: [{ feature: "Members", actions: ["Read", "Write"] }],
      eventIds: [],
    })).resolves.toEqual({ success: true, data: undefined })
    const updated = await db.user.findUniqueOrThrow({
      where: { id: admin.id },
      include: { permissions: true },
    })
    expect(updated.username).toBe("renamed-admin")
    expect(updated.role).toBe("SuperAdmin")
    expect(updated.permissions).toHaveLength(2)
  })

  it("rejects a username already used by another account without changing the target", async () => {
    const target = await seedStaff()
    await db.user.create({ data: { username: "taken", name: "Other", role: "Staff" } })

    await expect(updateUserPermissions(target.id, {
      username: "taken",
      role: "SuperAdmin",
      permissions: [{ feature: "Members", actions: ["Read"] }],
      eventIds: [],
    })).resolves.toEqual({
      success: false,
      error: "An account with this username already exists",
    })
    const unchanged = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.username).toBe("staff")
    expect(unchanged.role).toBe("Staff")
    expect(await db.userPermission.count({ where: { userId: target.id } })).toBe(0)
  })

  it("rejects an event scope that references an event that no longer exists", async () => {
    const staff = await seedStaff()

    await expect(
      updateUserPermissions(staff.id, {
        username: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read"] }],
        eventIds: ["missing-event"],
      })
    ).resolves.toEqual({ success: false, error: "One or more selected events no longer exist" })
    expect(await db.userPermission.count({ where: { userId: staff.id } })).toBe(0)
  })
})
