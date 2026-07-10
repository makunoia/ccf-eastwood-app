import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  buildSessionAttendanceTable,
  buildSessionsSummaryTable,
} from "@/lib/export-entities"
import { getSessionsAttendanceExport } from "@/app/(event)/event/[id]/sessions/export-actions"

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
    "OccurrenceAttendee",
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

// ── Unit: CSV table builders ──────────────────────────────────────────────────

describe("buildSessionsSummaryTable", () => {
  const rows = [
    {
      date: "2026-03-08T00:00:00.000Z",
      seriesTitle: "March Run",
      isStandalone: false,
      attendeeCount: 12,
    },
    {
      date: "2026-03-01T00:00:00.000Z",
      seriesTitle: null,
      isStandalone: true,
      attendeeCount: 40,
    },
  ]

  it("includes series and stand-alone columns for recurring events, sorted by date", () => {
    const { headers, cells } = buildSessionsSummaryTable(rows, true)
    expect(headers).toEqual(["Date", "Series", "Stand-alone", "Attendance"])
    expect(cells).toEqual([
      ["2026-03-01", null, "Yes", 40],
      ["2026-03-08", "March Run", "No", 12],
    ])
  })

  it("omits series columns for non-recurring events", () => {
    const { headers, cells } = buildSessionsSummaryTable(rows, false)
    expect(headers).toEqual(["Date", "Attendance"])
    expect(cells).toEqual([
      ["2026-03-01", 40],
      ["2026-03-08", 12],
    ])
  })

  it("handles an empty session list", () => {
    const { headers, cells } = buildSessionsSummaryTable([], true)
    expect(headers).toEqual(["Date", "Series", "Stand-alone", "Attendance"])
    expect(cells).toEqual([])
  })
})

describe("buildSessionAttendanceTable", () => {
  const row = {
    sessionDate: "2026-03-01",
    seriesTitle: "March Run",
    firstName: "Juan",
    lastName: "Dela Cruz",
    mobile: "+63 917 123 4567",
    type: "Member" as const,
    checkedInAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
  }

  it("formats check-in time in Asia/Manila and includes the series column when recurring", () => {
    const { headers, cells } = buildSessionAttendanceTable([row], true)
    expect(headers).toEqual([
      "Session Date",
      "Series",
      "First Name",
      "Last Name",
      "Mobile",
      "Type",
      "Checked In",
    ])
    expect(cells).toHaveLength(1)
    const [cell] = cells
    expect(cell.slice(0, 6)).toEqual([
      "2026-03-01",
      "March Run",
      "Juan",
      "Dela Cruz",
      "+63 917 123 4567",
      "Member",
    ])
    expect(String(cell[6]).toLowerCase()).toContain("9:30")
  })

  it("omits the series column when not recurring", () => {
    const { headers, cells } = buildSessionAttendanceTable([row], false)
    expect(headers).toEqual([
      "Session Date",
      "First Name",
      "Last Name",
      "Mobile",
      "Type",
      "Checked In",
    ])
    expect(cells[0]).toHaveLength(6)
  })
})

// ── Integration: getSessionsAttendanceExport ──────────────────────────────────

describe("getSessionsAttendanceExport", () => {
  async function seedEventWithAttendance() {
    const event = await db.event.create({
      data: {
        name: "Elevate Weekly",
        type: "Recurring",
        startDate: new Date("2026-03-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    })

    const series = await db.eventOccurrenceSeries.create({
      data: {
        eventId: event.id,
        title: "March Run",
        startDate: new Date("2026-03-01T00:00:00Z"),
        endDate: new Date("2026-03-31T00:00:00Z"),
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        seriesId: series.id,
        date: new Date("2026-03-01T00:00:00Z"),
      },
    })

    const member = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 111 2222",
        dateJoined: new Date(),
        language: [],
      },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Pedro",
        lastName: "Reyes",
        phone: "+63 917 333 4444",
        language: [],
      },
    })

    const memberRegistrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    const guestRegistrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    // Walk-in with personal fields only (both FKs null)
    const walkInRegistrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Lopez",
        mobileNumber: "+63 917 555 6666",
      },
    })

    const committee = await db.volunteerCommittee.create({
      data: { name: "Ushering", eventId: event.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
    })
    const volunteerMember = await db.member.create({
      data: {
        firstName: "Vince",
        lastName: "Tan",
        phone: "+63 917 777 8888",
        dateJoined: new Date(),
        language: [],
      },
    })
    const volunteer = await db.volunteer.create({
      data: {
        memberId: volunteerMember.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })

    await db.occurrenceAttendee.createMany({
      data: [
        {
          occurrenceId: occurrence.id,
          registrantId: memberRegistrant.id,
          checkedInAt: new Date("2026-03-01T01:00:00Z"),
        },
        {
          occurrenceId: occurrence.id,
          registrantId: guestRegistrant.id,
          checkedInAt: new Date("2026-03-01T01:05:00Z"),
        },
        {
          occurrenceId: occurrence.id,
          registrantId: walkInRegistrant.id,
          checkedInAt: new Date("2026-03-01T01:10:00Z"),
        },
        {
          occurrenceId: occurrence.id,
          volunteerId: volunteer.id,
          checkedInAt: new Date("2026-03-01T00:30:00Z"),
        },
      ],
    })

    return { event }
  }

  it("returns one row per check-in with resolved names, types, and series", async () => {
    const { event } = await seedEventWithAttendance()

    const result = await getSessionsAttendanceExport(event.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data).toHaveLength(4)
    // Sorted by check-in time within the occurrence — volunteer checked in first
    expect(result.data[0]).toMatchObject({
      sessionDate: "2026-03-01",
      seriesTitle: "March Run",
      firstName: "Vince",
      lastName: "Tan",
      mobile: "+63 917 777 8888",
      type: "Volunteer",
    })
    expect(result.data[1]).toMatchObject({
      firstName: "Maria",
      lastName: "Santos",
      mobile: "+63 917 111 2222",
      type: "Member",
    })
    expect(result.data[2]).toMatchObject({
      firstName: "Pedro",
      lastName: "Reyes",
      mobile: "+63 917 333 4444",
      type: "Guest",
    })
    // Walk-in falls back to the registrant's own personal fields
    expect(result.data[3]).toMatchObject({
      firstName: "Ana",
      lastName: "Lopez",
      mobile: "+63 917 555 6666",
      type: "Guest",
    })
  })

  it("returns an empty list for an event with no attendance", async () => {
    const event = await db.event.create({
      data: {
        name: "Empty Event",
        type: "MultiDay",
        startDate: new Date("2026-04-01T00:00:00Z"),
        endDate: new Date("2026-04-03T00:00:00Z"),
      },
    })

    const result = await getSessionsAttendanceExport(event.id)
    expect(result).toEqual({ success: true, data: [] })
  })

  it("rejects unauthenticated callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await getSessionsAttendanceExport("any-event")
    expect(result).toEqual({ success: false, error: "Not authenticated." })
  })

  it("rejects users without the Events export permission", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        ...adminSession.user,
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Write"] }],
      },
    } as never)

    const result = await getSessionsAttendanceExport("any-event")
    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })
})
