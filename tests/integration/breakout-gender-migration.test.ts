import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260928090000_preserve_breakout_gender_focus/migration.sql"),
  "utf8"
)

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "SmallGroup", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("preserve former effective breakout gender focus", () => {
  it("backfills inferred values, keeps an explicit focus, and leaves unknown groups open", async () => {
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Breakouts", eventId: event.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Facilitator", committeeId: committee.id },
    })
    const volunteer = async (firstName: string, gender: "Male" | "Female" | null) => {
      const member = await db.member.create({
        data: { firstName, lastName: "Leader", dateJoined: new Date(), gender, language: [] },
      })
      return db.volunteer.create({
        data: {
          memberId: member.id,
          eventId: event.id,
          committeeId: committee.id,
          preferredRoleId: role.id,
        },
      })
    }
    const male = await volunteer("Male", "Male")
    const female = await volunteer("Female", "Female")
    const unknown = await volunteer("Unknown", null)
    const linked = await db.smallGroup.create({
      data: { name: "Linked", leaderId: (await db.volunteer.findUniqueOrThrow({
        where: { id: unknown.id }, select: { memberId: true },
      })).memberId, genderFocus: "Female" },
    })
    const groups = await Promise.all([
      db.breakoutGroup.create({ data: { eventId: event.id, name: "Lead", facilitatorId: male.id } }),
      db.breakoutGroup.create({ data: { eventId: event.id, name: "Mixed", facilitatorId: male.id, coFacilitatorId: female.id } }),
      db.breakoutGroup.create({ data: { eventId: event.id, name: "Linked", facilitatorId: unknown.id, linkedSmallGroupId: linked.id } }),
      db.breakoutGroup.create({ data: { eventId: event.id, name: "Explicit", facilitatorId: male.id, genderFocus: "Female" } }),
      db.breakoutGroup.create({ data: { eventId: event.id, name: "Open" } }),
    ])

    await db.$executeRawUnsafe(migration)

    const saved = await db.breakoutGroup.findMany({
      where: { id: { in: groups.map((group) => group.id) } },
      select: { name: true, genderFocus: true },
    })
    expect(Object.fromEntries(saved.map((group) => [group.name, group.genderFocus]))).toEqual({
      Lead: "Male",
      Mixed: "Mixed",
      Linked: "Female",
      Explicit: "Female",
      Open: null,
    })
  })
})
