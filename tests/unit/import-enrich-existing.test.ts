import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { importGuests } from "@/app/(dashboard)/guests/import-actions"
import { importMembers } from "@/app/(dashboard)/members/import-actions"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"

afterAll(async () => {
  await db.$disconnect()
})

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroup", "EventRegistrant", "Event", "Guest", "SchedulePreference", "Member", "LifeStage"
    RESTART IDENTITY CASCADE`
})

describe("existing-record enrichment during imports", () => {
  it("fills missing member fields without overwriting populated ones", async () => {
    const member = await db.member.create({
      data: {
        firstName: "Juan",
        lastName: "Cruz",
        dateJoined: new Date("2024-01-01T00:00:00Z"),
        language: [],
        email: null,
        phone: "09170000000",
        workCity: "Makati",
      },
      select: { id: true },
    })

    const result = await importMembers([
      {
        mapped: {
          firstName: "Johnny",
          lastName: "Cruz",
          dateJoined: "2026-01-01",
          email: "juan@example.com",
          phone: "09179999999",
          workCity: "Pasig",
          birthYear: "1992",
        },
        resolution: "use-existing",
        existingId: member.id,
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(1)

    const updated = await db.member.findUnique({
      where: { id: member.id },
      select: { firstName: true, email: true, phone: true, workCity: true, birthYear: true },
    })
    expect(updated).toMatchObject({
      firstName: "Juan",
      email: "juan@example.com",
      phone: "09170000000",
      workCity: "Makati",
      birthYear: 1992,
    })
  })

  it("fills missing guest fields without overwriting populated ones", async () => {
    const guest = await db.guest.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        language: [],
        email: null,
        phone: "09171111111",
        notes: "Existing notes",
      },
      select: { id: true },
    })

    const result = await importGuests([
      {
        mapped: {
          firstName: "Maria",
          lastName: "Updated",
          email: "maria@example.com",
          phone: "09172222222",
          notes: "New notes",
          gender: "Female",
        },
        resolution: "use-existing",
        existingId: guest.id,
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(1)

    const updated = await db.guest.findUnique({
      where: { id: guest.id },
      select: { lastName: true, email: true, phone: true, notes: true, gender: true },
    })
    expect(updated).toMatchObject({
      lastName: "Santos",
      email: "maria@example.com",
      phone: "09171111111",
      notes: "Existing notes",
      gender: "Female",
    })
  })

  it("fills missing small-group fields without overwriting populated ones", async () => {
    const leader = await db.member.create({
      data: {
        firstName: "Leader",
        lastName: "Person",
        dateJoined: new Date(),
        language: [],
        email: "leader@example.com",
      },
      select: { id: true },
    })
    const existing = await db.smallGroup.create({
      data: {
        name: "Alpha Group",
        locationCity: "Quezon City",
      },
      select: { id: true },
    })

    const result = await importSmallGroups([
      {
        mapped: {
          name: "Alpha Group",
          leaderEmail: "leader@example.com",
          locationCity: "Pasig",
          memberLimit: "12",
        },
        resolution: "use-existing",
        existingId: existing.id,
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated).toBe(1)

    const updated = await db.smallGroup.findUnique({
      where: { id: existing.id },
      select: { leaderId: true, locationCity: true, memberLimit: true },
    })
    expect(updated).toMatchObject({
      leaderId: leader.id,
      locationCity: "Quezon City",
      memberLimit: 12,
    })
  })
})
