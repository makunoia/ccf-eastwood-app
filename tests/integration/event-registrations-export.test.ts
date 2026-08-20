import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  getEventRegistrationExport,
  getEventRegistrationExportRows,
} from "@/lib/exports/event-registrations-server"
import { getEventRegistrationsExport } from "@/app/(event)/event/[id]/registrants/export-actions"

/**
 * Export of registration records for a single event.
 *
 *  - integration: one row per registration, every form answer resolved from
 *                 Member → Guest → the registrant's own fields, ordered by
 *                 last/first name; the column offer follows what the event's
 *                 three form contexts ask for, plus its enabled modules
 *  - regression:  the per-event nickname beats the profile's; the guest's own
 *                 schedule beats a member schedule preference
 *  - edge case:   walk-in with no FK, OneTime attendedAt vs session attendance,
 *                 claimed satellite fallback, several breakouts/buses on one row
 *  - permissions: unauthenticated / no Export action / no access to the event
 *  - unit:        column model covered in tests/unit/event-registrations-export
 *  - e2e:         skipped — the download is a Blob click over an action already
 *                 asserted here; the browser adds no new behaviour
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: { id: "test-admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "BreakoutGroupMember", "BreakoutGroup",
    "BusPassenger", "Bus", "BaptismOptIn", "EventModule",
    "FamilyMember", "Family", "SchedulePreference",
    "EventRegistrant", "EventFormConfig",
    "Event", "Guest", "Member", "LifeStage", "AgeRangeBucket", "SmallGroup"
    RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

const EVENT_DATE = new Date("2026-08-02T00:00:00Z")

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: EVENT_DATE,
      endDate: EVENT_DATE,
      ...overrides,
    },
  })
}

async function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      phone: "+63 917 111 2222",
      email: "maria@example.com",
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
  })
}

async function seedGuest(overrides: Record<string, unknown> = {}) {
  return db.guest.create({
    data: {
      firstName: "Pedro",
      lastName: "Reyes",
      phone: "+63 917 333 4444",
      language: [],
      ...overrides,
    },
  })
}

// ── Rows ─────────────────────────────────────────────────────────────────────

describe("getEventRegistrationExportRows", () => {
  it("resolves names from the member, the guest, then the registrant's own fields", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const guest = await seedGuest()

    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Lopez",
        mobileNumber: "+63 917 555 6666",
        email: "ana@example.com",
      },
    })

    const rows = await getEventRegistrationExportRows(event.id)
    // Sorted by last name, then first: Lopez, Reyes, Santos.
    expect(rows.map((r) => `${r.firstName} ${r.lastName}`)).toEqual([
      "Ana Lopez",
      "Pedro Reyes",
      "Maria Santos",
    ])
    expect(rows.map((r) => r.type)).toEqual(["Guest", "Guest", "Member"])
    expect(rows[0]).toMatchObject({ mobile: "+63 917 555 6666", email: "ana@example.com" })
    expect(rows[2]).toMatchObject({ mobile: "+63 917 111 2222", email: "maria@example.com" })
  })

  it("keeps a duplicate sign-up as two rows so an admin can see it", async () => {
    // Unlike the cluster export there is nothing to fold: a second registration
    // on one event is a data problem, and merging it would hide it.
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const rows = await getEventRegistrationExportRows(event.id)
    expect(rows).toHaveLength(2)
  })

  it("resolves every form answer from the member's profile", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
    const bucket = await db.ageRangeBucket.create({
      data: { label: "25–34", minAge: 25, maxAge: 34, order: 1 },
    })
    const event = await seedEvent()
    const member = await seedMember({
      nickname: "Mars",
      gender: "Female",
      birthMonth: 3,
      birthYear: 1994,
      workCity: "Makati",
      language: ["English", "Tagalog"],
      meetingPreference: "InPerson",
      lifeStageId: lifeStage.id,
      ageRangeBucketId: bucket.id,
      schedulePreferences: {
        create: { dayOfWeek: 6, timeStart: "18:00", timeEnd: "20:00" },
      },
    })
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        memberId: member.id,
        dietaryPreference: "Halal",
        isPaid: true,
        paymentReference: "GC-9001",
      },
    })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row).toMatchObject({
      nickname: "Mars",
      lifeStage: "Young Pro",
      birthDate: "March 1994",
      ageRange: "25–34",
      gender: "Female",
      language: "English, Tagalog",
      meetingPreference: "In Person",
      schedule: "Saturday, 18:00 – 20:00",
      workCity: "Makati",
      dietary: "Halal",
      isPaid: true,
      paymentReference: "GC-9001",
    })
  })

  it("prefers the per-event nickname over the profile's", async () => {
    const event = await seedEvent()
    const member = await seedMember({ nickname: "Mars" })
    await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id, nickname: "Ate M" },
    })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.nickname).toBe("Ate M")
  })

  it("reads a guest's own single schedule slot", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({
      scheduleDayOfWeek: 3,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.schedule).toBe("Wednesday, 19:00 – 21:00")
  })

  it("names the satellite when a guest claims a group we don't hold", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ claimedSatellite: "Ortigas" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.claimedSmallGroup).toBe("Ortigas (another satellite)")
  })

  it("uses the claimed group's name when we do hold it", async () => {
    const leader = await seedMember({ firstName: "Leo", lastName: "Cruz" })
    const group = await db.smallGroup.create({
      data: { name: "Team Ignite", leaderId: leader.id, language: [] },
    })
    const event = await seedEvent()
    const guest = await seedGuest({ claimedSmallGroupId: group.id })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.claimedSmallGroup).toBe("Team Ignite")
  })

  it("marks a OneTime arrival through attendedAt", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        memberId: member.id,
        attendedAt: new Date("2026-08-02T02:05:00Z"),
      },
    })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.attendedAt).toBe("2026-08-02T02:05:00.000Z")
    expect(row.sessionsAttended).toBe(0)
    expect(row.sessionDates).toBeNull()
  })

  it("counts and lists the sessions a person checked in to", async () => {
    const event = await seedEvent({
      type: "MultiDay",
      endDate: new Date("2026-08-04T00:00:00Z"),
    })
    const member = await seedMember()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    // Created out of order on purpose — the dates must come back sorted.
    for (const day of ["2026-08-04", "2026-08-02"]) {
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(`${day}T00:00:00Z`) },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })
    }

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.sessionsAttended).toBe(2)
    expect(row.sessionDates).toBe("2026-08-02; 2026-08-04")
  })

  it("accumulates several breakout groups and bus assignments onto one row", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    for (const name of ["Table 1", "Table 2"]) {
      const group = await db.breakoutGroup.create({
        data: { eventId: event.id, name, language: [] },
      })
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: group.id, registrantId: registrant.id },
      })
    }
    const bus = await db.bus.create({
      data: { eventId: event.id, name: "Bus A", direction: "ToVenue" },
    })
    await db.busPassenger.create({ data: { busId: bus.id, registrantId: registrant.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.breakoutGroup).toBe("Table 1; Table 2")
    expect(row.bus).toBe("Bus A")
    expect(row.busDirection).toBe("ToVenue")
  })

  it("reports a baptism opt-in", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    await db.baptismOptIn.create({ data: { eventId: event.id, registrantId: registrant.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.baptismOptIn).toBe(true)
  })

  it("labels a household from the family link", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const other = await seedMember({
      firstName: "Jose",
      lastName: "Santos",
      email: "jose@example.com",
      phone: "+63 917 999 0000",
    })
    const family = await db.family.create({ data: { name: "Santos Family" } })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: "MotherWife" },
    })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: other.id, role: "FatherHusband" },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const [row] = await getEventRegistrationExportRows(event.id)
    expect(row.household).toContain("Santos Family")
  })

  it("returns nothing for an event with no registrants", async () => {
    const event = await seedEvent()
    expect(await getEventRegistrationExportRows(event.id)).toEqual([])
  })

  it("never reaches into another event's registrations", async () => {
    const [event, other] = await Promise.all([seedEvent(), seedEvent({ name: "Youth Night" })])
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: other.id, memberId: member.id } })

    expect(await getEventRegistrationExportRows(event.id)).toEqual([])
  })
})

// ── Column offer ─────────────────────────────────────────────────────────────

describe("getEventRegistrationExport", () => {
  it("offers the fields the event's forms ask for and drops the rest", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldWorkCity: true },
    })
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const payload = await getEventRegistrationExport(adminSession, event.id)
    const keys = payload!.columns.map((c) => c.key)
    expect(keys).toContain("firstName")
    expect(keys).toContain("workCity")
    expect(keys).not.toContain("gender")
    expect(payload!.eventType).toBe("OneTime")
  })

  it("unions the three form contexts — any of them asking is enough", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldWorkCity: true },
    })
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "CheckIn", fieldGender: true },
    })
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const payload = await getEventRegistrationExport(adminSession, event.id)
    const keys = payload!.columns.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(["workCity", "gender"]))
  })

  it("keeps a column whose toggle was switched off after answers arrived", async () => {
    const event = await seedEvent()
    const member = await seedMember({ workCity: "Makati" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const payload = await getEventRegistrationExport(adminSession, event.id)
    expect(payload!.columns.find((c) => c.key === "workCity")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("offers the module columns for the event's enabled modules", async () => {
    const event = await seedEvent()
    await db.eventModule.create({ data: { eventId: event.id, type: "Baptism" } })
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const payload = await getEventRegistrationExport(adminSession, event.id)
    expect(payload!.columns.find((c) => c.key === "baptismOptIn")).toMatchObject({
      collected: true,
    })
  })

  it("gives a session event the attendance summary columns", async () => {
    const event = await seedEvent({
      type: "Recurring",
      endDate: new Date("2026-12-31T00:00:00Z"),
    })
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const payload = await getEventRegistrationExport(adminSession, event.id)
    const keys = payload!.columns.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(["sessionsAttended", "sessionDates"]))
    expect(keys).not.toContain("attended")
  })

  it("returns null for an event that doesn't exist", async () => {
    expect(await getEventRegistrationExport(adminSession, "no-such-event")).toBeNull()
  })

  it("returns null for an event the caller may not see", async () => {
    const event = await seedEvent()
    const scoped = {
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: ["some-other-event"],
      },
    } as unknown as Session

    expect(await getEventRegistrationExport(scoped, event.id)).toBeNull()
  })
})

// ── The action ───────────────────────────────────────────────────────────────

describe("getEventRegistrationsExport", () => {
  it("returns rows and columns to an authorised caller", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await getEventRegistrationsExport(event.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.rows).toHaveLength(1)
    expect(result.data.columns.length).toBeGreaterThan(0)
  })

  it("rejects unauthenticated callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await getEventRegistrationsExport("any-event")).toEqual({
      success: false,
      error: "Not authenticated.",
    })
  })

  it("rejects a user without the Events export permission", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Write"] }],
        eventAccess: [],
      },
    } as never)

    expect(await getEventRegistrationsExport("any-event")).toEqual({
      success: false,
      error: "Unauthorized.",
    })
  })

  it("rejects a user scoped away from this event", async () => {
    const event = await seedEvent()
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: ["some-other-event"],
      },
    } as never)

    expect(await getEventRegistrationsExport(event.id)).toEqual({
      success: false,
      error: "Unauthorized.",
    })
  })
})
