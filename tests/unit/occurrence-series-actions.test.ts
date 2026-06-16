import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  createOccurrence,
  createOccurrenceSeries,
  deleteOccurrenceSeries,
  updateOccurrenceGrouping,
} from "@/app/(dashboard)/events/actions"

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

async function seedRecurringEvent() {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "Recurring",
      startDate: new Date("2026-02-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      recurrenceDayOfWeek: 0,
      recurrenceFrequency: "Weekly",
    },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee",
    "OccurrenceSubFacilitator",
    "BreakoutGroupMember",
    "BreakoutGroupSchedule",
    "BreakoutGroup",
    "Volunteer",
    "CommitteeRole",
    "VolunteerCommittee",
    "EventRegistrant",
    "EventOccurrence",
    "EventOccurrenceSeries",
    "Event",
    "SmallGroup",
    "Member",
    "Guest"
    RESTART IDENTITY CASCADE`

  // next-auth's `auth` is overloaded; vi.mocked resolves the middleware overload,
  // so cast the session through `never` to bypass overload resolution.
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

describe("occurrence series actions", () => {
  it("creates a series and assigns matching non-stand-alone occurrences", async () => {
    const event = await seedRecurringEvent()

    const groupedOccurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        date: new Date("2026-02-08T00:00:00Z"),
      },
    })
    const standaloneOccurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        date: new Date("2026-02-15T00:00:00Z"),
        isStandalone: true,
      },
    })

    const result = await createOccurrenceSeries(event.id, {
      title: "February to Mid-March",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })

    expect(result.success).toBe(true)

    const refreshedGrouped = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: groupedOccurrence.id },
      select: { seriesId: true, isStandalone: true },
    })
    const refreshedStandalone = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: standaloneOccurrence.id },
      select: { seriesId: true, isStandalone: true },
    })

    expect(refreshedGrouped.seriesId).not.toBeNull()
    expect(refreshedGrouped.isStandalone).toBe(false)
    expect(refreshedStandalone.seriesId).toBeNull()
    expect(refreshedStandalone.isStandalone).toBe(true)
  })

  it("rejects overlapping series ranges for the same event", async () => {
    const event = await seedRecurringEvent()

    await createOccurrenceSeries(event.id, {
      title: "February Run",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })

    const result = await createOccurrenceSeries(event.id, {
      title: "March Run",
      startDate: "2026-03-01",
      endDate: "2026-03-28",
    })

    expect(result).toEqual({
      success: false,
      error: 'Series overlaps with "February Run"',
    })
  })

  it("auto-assigns a new occurrence into the matching series", async () => {
    const event = await seedRecurringEvent()
    const series = await createOccurrenceSeries(event.id, {
      title: "February Run",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })

    expect(series.success).toBe(true)

    const result = await createOccurrence(event.id, {
      date: "2026-02-22",
      isStandalone: false,
      seriesId: null,
    })

    expect(result.success).toBe(true)

    const occurrence = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: result.success ? result.data.id : "" },
      select: { seriesId: true, isStandalone: true },
    })

    expect(occurrence.seriesId).not.toBeNull()
    expect(occurrence.isStandalone).toBe(false)
  })

  it("creates a stand-alone occurrence outside series grouping", async () => {
    const event = await seedRecurringEvent()

    await createOccurrenceSeries(event.id, {
      title: "February Run",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })

    const result = await createOccurrence(event.id, {
      date: "2026-02-22",
      isStandalone: true,
      seriesId: null,
    })

    expect(result.success).toBe(true)

    const occurrence = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: result.success ? result.data.id : "" },
      select: { seriesId: true, isStandalone: true },
    })

    expect(occurrence.seriesId).toBeNull()
    expect(occurrence.isStandalone).toBe(true)
  })

  it("switches a session between stand-alone and grouped", async () => {
    const event = await seedRecurringEvent()
    const seriesResult = await createOccurrenceSeries(event.id, {
      title: "February Run",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })
    expect(seriesResult.success).toBe(true)

    const occurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        date: new Date("2026-02-08T00:00:00Z"),
        isStandalone: true,
      },
    })

    const grouped = await updateOccurrenceGrouping(occurrence.id, event.id, {
      isStandalone: false,
      seriesId: null,
    })
    expect(grouped.success).toBe(true)

    let refreshed = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
      select: { seriesId: true, isStandalone: true },
    })
    expect(refreshed.seriesId).not.toBeNull()
    expect(refreshed.isStandalone).toBe(false)

    const standalone = await updateOccurrenceGrouping(occurrence.id, event.id, {
      isStandalone: true,
      seriesId: null,
    })
    expect(standalone.success).toBe(true)

    refreshed = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
      select: { seriesId: true, isStandalone: true },
    })
    expect(refreshed.seriesId).toBeNull()
    expect(refreshed.isStandalone).toBe(true)
  })

  it("deletes a series without deleting occurrences or attendance", async () => {
    const event = await seedRecurringEvent()
    const seriesResult = await createOccurrenceSeries(event.id, {
      title: "February Run",
      startDate: "2026-02-01",
      endDate: "2026-03-14",
    })
    expect(seriesResult.success).toBe(true)

    const occurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        date: new Date("2026-02-08T00:00:00Z"),
        seriesId: seriesResult.success ? seriesResult.data.id : null,
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Cruz",
      },
    })
    await db.occurrenceAttendee.create({
      data: {
        occurrenceId: occurrence.id,
        registrantId: registrant.id,
      },
    })

    const result = await deleteOccurrenceSeries(
      seriesResult.success ? seriesResult.data.id : "",
      event.id,
    )

    expect(result.success).toBe(true)
    await expect(
      db.eventOccurrenceSeries.findFirst({
        where: { eventId: event.id },
      }),
    ).resolves.toBeNull()

    const refreshedOccurrence = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
      select: { id: true, seriesId: true },
    })

    expect(refreshedOccurrence.id).toBe(occurrence.id)
    expect(refreshedOccurrence.seriesId).toBeNull()
    expect(
      await db.occurrenceAttendee.count({
        where: { occurrenceId: occurrence.id },
      }),
    ).toBe(1)
  })
})
