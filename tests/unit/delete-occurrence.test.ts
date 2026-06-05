import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { FacilitatorRole } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { deleteOccurrence } from "@/app/(dashboard)/events/actions"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

const adminSession = {
  user: {
    id: "test-admin",
    name: "Test Admin",
    email: "test@example.com",
    username: "test-admin",
    role: "SuperAdmin",
    permissions: [],
    eventAccess: [],
    totpEnabled: false,
    mustChangePassword: false,
    requiresTotpSetup: false,
  },
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceSubFacilitator",
    "OccurrenceAttendee",
    "BreakoutGroupMember",
    "BreakoutGroupSchedule",
    "BreakoutGroup",
    "Volunteer",
    "CommitteeRole",
    "VolunteerCommittee",
    "EventRegistrant",
    "EventOccurrence",
    "Event",
    "SmallGroup",
    "Member",
    "Guest"
    RESTART IDENTITY CASCADE`

  vi.mocked(auth).mockResolvedValue(adminSession)
})

afterAll(async () => {
  await db.$disconnect()
})

describe("deleteOccurrence", () => {
  it("deletes a recurring session and its dependent records", async () => {
    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "Recurring",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        recurrenceDayOfWeek: 0,
        recurrenceFrequency: "Weekly",
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-07T00:00:00Z") },
    })

    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Cruz",
      },
    })

    await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, registrantId: registrant.id },
    })

    const committee = await db.volunteerCommittee.create({
      data: { name: "Facilitators", eventId: event.id },
    })

    const role = await db.committeeRole.create({
      data: { name: "Facilitator", committeeId: committee.id },
    })

    const member = await db.member.create({
      data: {
        firstName: "Ben",
        lastName: "Santos",
        dateJoined: new Date("2026-01-01T00:00:00Z"),
        language: [],
      },
    })

    const volunteer = await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })

    const breakoutGroup = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Table 1" },
    })

    await db.occurrenceSubFacilitator.create({
      data: {
        occurrenceId: occurrence.id,
        breakoutGroupId: breakoutGroup.id,
        role: FacilitatorRole.Facilitator,
        substituteId: volunteer.id,
      },
    })

    const result = await deleteOccurrence(occurrence.id, event.id)

    expect(result.success).toBe(true)
    await expect(
      db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    ).resolves.toBeNull()
    expect(
      await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
    ).toBe(0)
    expect(
      await db.occurrenceSubFacilitator.count({ where: { occurrenceId: occurrence.id } })
    ).toBe(0)
  })

  it("rejects deleting a non-recurring event day", async () => {
    const event = await db.event.create({
      data: {
        name: "Camp",
        type: "MultiDay",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-06-03T00:00:00Z"),
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-01T00:00:00Z") },
    })

    const result = await deleteOccurrence(occurrence.id, event.id)

    expect(result).toEqual({
      success: false,
      error: "Only recurring sessions can be deleted",
    })
    await expect(
      db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    ).resolves.not.toBeNull()
  })

  it("rejects deletion when the user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "Recurring",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        recurrenceDayOfWeek: 0,
        recurrenceFrequency: "Weekly",
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-14T00:00:00Z") },
    })

    const result = await deleteOccurrence(occurrence.id, event.id)

    expect(result).toEqual({
      success: false,
      error: "Not authenticated.",
    })
    await expect(
      db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    ).resolves.not.toBeNull()
  })

  it("rejects deletion when the session does not belong to the given event", async () => {
    const firstEvent = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "Recurring",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        recurrenceDayOfWeek: 0,
        recurrenceFrequency: "Weekly",
      },
    })

    const secondEvent = await db.event.create({
      data: {
        name: "Prayer Night",
        type: "Recurring",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        recurrenceDayOfWeek: 3,
        recurrenceFrequency: "Weekly",
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: firstEvent.id, date: new Date("2026-06-21T00:00:00Z") },
    })

    const result = await deleteOccurrence(occurrence.id, secondEvent.id)

    expect(result).toEqual({
      success: false,
      error: "Session not found",
    })
    await expect(
      db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    ).resolves.not.toBeNull()
  })

  it("deletes only the targeted session and leaves sibling sessions intact", async () => {
    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "Recurring",
        startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        recurrenceDayOfWeek: 0,
        recurrenceFrequency: "Weekly",
      },
    })

    const firstOccurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-07T00:00:00Z") },
    })

    const secondOccurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-14T00:00:00Z") },
    })

    const result = await deleteOccurrence(firstOccurrence.id, event.id)

    expect(result.success).toBe(true)
    await expect(
      db.eventOccurrence.findUnique({ where: { id: firstOccurrence.id } })
    ).resolves.toBeNull()
    await expect(
      db.eventOccurrence.findUnique({ where: { id: secondOccurrence.id } })
    ).resolves.not.toBeNull()
  })
})
