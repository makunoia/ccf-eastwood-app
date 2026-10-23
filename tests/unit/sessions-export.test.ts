import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { buildSessionsSummaryTable } from "@/lib/export-entities"
import {
  buildSessionAttendanceColumns,
  buildSessionAttendanceTable,
  sessionAttendanceColumns,
  type SessionAttendanceExportRow,
} from "@/lib/exports/session-attendance"
import { defaultSelectedColumns } from "@/lib/exports/columns"
import { getSessionsAttendanceExport } from "@/app/(event)/event/[id]/sessions/export-actions"
import { setOccurrenceCheckinOpen } from "@/app/(dashboard)/events/actions"
import * as sessionBreakoutsServer from "@/lib/exports/session-breakouts-server"

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

describe("session attendance columns", () => {
  const row: SessionAttendanceExportRow = {
    sessionDate: "2026-03-01",
    seriesTitle: "March Run",
    firstName: "Juan",
    lastName: "Dela Cruz",
    nickname: null,
    mobile: "+63 917 123 4567",
    email: null,
    type: "Member" as const,
    checkedInAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
  }

  function allColumns(rows: SessionAttendanceExportRow[]) {
    const columns = buildSessionAttendanceColumns(rows)
    return { columns, selected: defaultSelectedColumns(columns) }
  }

  it("formats check-in time in Asia/Manila", () => {
    const { selected } = allColumns([row])
    const { headers, cells } = buildSessionAttendanceTable([row], selected)
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

  it("drops the series column when no row carries one", () => {
    const { columns, selected } = allColumns([{ ...row, seriesTitle: null }])
    expect(columns.map((c) => c.key)).not.toContain("seriesTitle")

    const { headers, cells } = buildSessionAttendanceTable([row], selected)
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

  it("offers nickname and email only once some row holds one", () => {
    const bare = buildSessionAttendanceColumns([row]).map((c) => c.key)
    expect(bare).not.toContain("nickname")
    expect(bare).not.toContain("email")

    const filled = buildSessionAttendanceColumns([
      { ...row, nickname: "JD", email: "juan@example.com" },
    ]).map((c) => c.key)
    expect(filled).toContain("nickname")
    expect(filled).toContain("email")
  })

  it("never flags an optional column as no longer asked", () => {
    // Nothing here is form-gathered, so no column should read as switched off.
    const columns = buildSessionAttendanceColumns([
      { ...row, nickname: "JD", email: "juan@example.com" },
    ])
    expect(columns.every((c) => c.core)).toBe(true)
  })

  it("offers breakout details only when populated and exports them through the column picker", () => {
    expect(buildSessionAttendanceColumns([row]).map((c) => c.key)).not.toContain("breakoutGroup")
    const seated = { ...row, breakoutGroup: "Table 4", facilitator: "Vince Tan", coFacilitator: "Maria Santos", breakoutRecord: "Saved at session close" as const }
    const columns = buildSessionAttendanceColumns([seated])
    expect(columns.filter((c) => c.group === "Breakout").map((c) => c.key)).toEqual([
      "breakoutGroup", "facilitator", "coFacilitator", "breakoutRecord",
    ])
    expect(buildSessionAttendanceTable([seated, row], ["facilitator", "breakoutGroup", "coFacilitator"]))
      .toEqual({ headers: ["Breakout Group / Table", "Facilitator", "Co-facilitator"], cells: [
        ["Table 4", "Vince Tan", "Maria Santos"], [undefined, undefined, undefined],
      ] })
  })

  it("renders the ticked columns in registry order, not tick order", () => {
    const { headers } = buildSessionAttendanceTable(
      [row],
      ["checkedInAt", "firstName", "sessionDate"],
    )
    expect(headers).toEqual(["Session Date", "First Name", "Checked In"])
  })

  it("returns headers only when there are no rows", () => {
    const { headers, cells } = buildSessionAttendanceTable(
      [],
      sessionAttendanceColumns().map((c) => c.key),
    )
    expect(headers.length).toBeGreaterThan(0)
    expect(cells).toEqual([])
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

    // Second session with a single check-in — used to verify the occurrence filter.
    const secondOccurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        seriesId: series.id,
        date: new Date("2026-03-08T00:00:00Z"),
      },
    })
    await db.occurrenceAttendee.create({
      data: {
        occurrenceId: secondOccurrence.id,
        registrantId: memberRegistrant.id,
        checkedInAt: new Date("2026-03-08T01:00:00Z"),
      },
    })

    return { event, occurrence, secondOccurrence, memberRegistrant, guestRegistrant, volunteer, member }
  }

  it("preserves each closed session's table and substitute facilitator after regrouping and deletion", async () => {
    const { event, occurrence, secondOccurrence, memberRegistrant, guestRegistrant, volunteer, member } = await seedEventWithAttendance()
    const group = await db.breakoutGroup.create({ data: {
      eventId: event.id, name: "Table 4", facilitatorId: volunteer.id,
      members: { create: [{ registrantId: memberRegistrant.id }, { registrantId: guestRegistrant.id }] },
    } })
    const substitute = await db.volunteer.create({ data: {
      memberId: member.id, eventId: event.id, committeeId: volunteer.committeeId, preferredRoleId: volunteer.preferredRoleId,
    } })
    await db.breakoutGroup.update({ where: { id: group.id }, data: { coFacilitatorId: substitute.id } })
    await db.occurrenceSubFacilitator.create({ data: {
      occurrenceId: secondOccurrence.id, breakoutGroupId: group.id, role: "Facilitator", substituteId: substitute.id,
    } })
    await db.occurrenceSubFacilitator.create({ data: {
      occurrenceId: secondOccurrence.id, breakoutGroupId: group.id, role: "CoFacilitator", substituteId: volunteer.id,
    } })
    expect((await setOccurrenceCheckinOpen(occurrence.id, true)).success).toBe(true)
    const live = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(live.success && live.data.rows.find((r) => r.firstName === "Pedro")).toMatchObject({
      breakoutGroup: "Table 4", facilitator: "Vince Tan", coFacilitator: "Maria Santos", breakoutRecord: "Live assignments",
    })
    expect((await setOccurrenceCheckinOpen(occurrence.id, false)).success).toBe(true)
    await db.breakoutGroup.update({ where: { id: group.id }, data: { name: "Table 8" } })
    expect((await setOccurrenceCheckinOpen(secondOccurrence.id, true)).success).toBe(true)
    expect((await setOccurrenceCheckinOpen(secondOccurrence.id, false)).success).toBe(true)
    // Neither today's table nor renamed facilitator profiles can rewrite history.
    await db.member.update({ where: { id: volunteer.memberId }, data: { firstName: "Renamed" } })
    await db.breakoutGroup.delete({ where: { id: group.id } })
    expect((await setOccurrenceCheckinOpen(occurrence.id, false)).success).toBe(true)
    const result = await getSessionsAttendanceExport(event.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.rows.filter((r) => r.sessionDate === "2026-03-01" && ["Maria", "Pedro", "Renamed"].includes(r.firstName)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "Member", breakoutGroup: "Table 4", facilitator: "Vince Tan", breakoutRecord: "Saved at session close" }),
        expect.objectContaining({ type: "Guest", breakoutGroup: "Table 4", facilitator: "Vince Tan" }),
        expect.objectContaining({ type: "Volunteer", breakoutGroup: "Table 4", facilitator: "Vince Tan" }),
      ]))
    expect(result.data.rows.find((r) => r.sessionDate === "2026-03-08")).toMatchObject({
      breakoutGroup: "Table 8", facilitator: "Maria Santos", coFacilitator: "Vince Tan", breakoutRecord: "Saved at session close",
    })
    expect(result.data.rows.find((r) => r.firstName === "Ana")).toMatchObject({ breakoutGroup: null, facilitator: null })
  })

  it("does not invent legacy session assignments from current seating", async () => {
    const { event, occurrence, memberRegistrant, volunteer } = await seedEventWithAttendance()
    await db.breakoutGroup.create({ data: {
      eventId: event.id, name: "Current table", facilitatorId: volunteer.id,
      members: { create: { registrantId: memberRegistrant.id } },
    } })
    const result = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.rows.every((r) => r.breakoutGroup === null && r.breakoutRecord === "Not recorded")).toBe(true)
  })

  it("reads a consistent roster if check-in closes and seating changes during an export", async () => {
    const { event, occurrence, memberRegistrant } = await seedEventWithAttendance()
    const group = await db.breakoutGroup.create({ data: {
      eventId: event.id, name: "Before close", members: { create: { registrantId: memberRegistrant.id } },
    } })
    await setOccurrenceCheckinOpen(occurrence.id, true)
    const load = sessionBreakoutsServer.loadSessionBreakoutGroups
    const spy = vi.spyOn(sessionBreakoutsServer, "loadSessionBreakoutGroups").mockImplementationOnce(async (...args) => {
      // The export has read isOpen, but has not queried the roster yet.
      expect((await setOccurrenceCheckinOpen(occurrence.id, false)).success).toBe(true)
      await db.breakoutGroup.update({ where: { id: group.id }, data: { name: "After close" } })
      return load(...args)
    })
    try {
      const result = await getSessionsAttendanceExport(event.id, occurrence.id)
      expect(result.success && result.data.rows.find((r) => r.firstName === "Maria")).toMatchObject({
        breakoutGroup: "Before close", breakoutRecord: "Live assignments",
      })
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    const closed = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(closed.success && closed.data.rows.find((r) => r.firstName === "Maria")).toMatchObject({
      breakoutGroup: "Before close", breakoutRecord: "Saved at session close",
    })
  })

  it("captures an empty roster and does not borrow another event's tables", async () => {
    const { event, occurrence, memberRegistrant } = await seedEventWithAttendance()
    const other = await db.event.create({ data: { name: "Other", type: "Recurring", startDate: new Date(), endDate: new Date() } })
    await db.breakoutGroup.create({ data: { eventId: other.id, name: "Other table", members: { create: { registrantId: memberRegistrant.id } } } })
    await setOccurrenceCheckinOpen(occurrence.id, true)
    await setOccurrenceCheckinOpen(occurrence.id, false)
    const result = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(result.success && result.data.rows.every((r) => r.breakoutGroup === null && r.breakoutRecord === "Saved at session close")).toBe(true)
  })

  it("allows an explicit reopen and close to save corrections, including expected absent participants", async () => {
    const { event, occurrence, guestRegistrant } = await seedEventWithAttendance()
    await db.occurrenceAttendee.deleteMany({ where: { occurrenceId: occurrence.id, registrantId: guestRegistrant.id } })
    await db.sessionRegistration.create({ data: { occurrenceId: occurrence.id, registrantId: guestRegistrant.id } })
    const group = await db.breakoutGroup.create({ data: {
      eventId: event.id, name: "Table 1", members: { create: { registrantId: guestRegistrant.id } },
    } })
    await setOccurrenceCheckinOpen(occurrence.id, true)
    await setOccurrenceCheckinOpen(occurrence.id, false)
    await db.breakoutGroup.update({ where: { id: group.id }, data: { name: "Corrected table" } })
    await setOccurrenceCheckinOpen(occurrence.id, true)
    await setOccurrenceCheckinOpen(occurrence.id, false)
    const result = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(result.success && result.data.rows.find((r) => r.firstName === "Pedro")).toMatchObject({
      breakoutGroup: "Corrected table", sessionRegistration: true, checkedInAt: null, breakoutRecord: "Saved at session close",
    })
  })

  it("does not let a staffer close and snapshot another event's session", async () => {
    const { occurrence } = await seedEventWithAttendance()
    await db.eventOccurrence.update({ where: { id: occurrence.id }, data: { isOpen: true } })
    vi.mocked(auth).mockResolvedValue({ user: {
      ...adminSession.user, role: "Staff", permissions: [{ feature: "Events", actions: ["Read", "Write"] }], eventAccess: ["another-event"],
    } } as never)
    expect(await setOccurrenceCheckinOpen(occurrence.id, false)).toEqual({ success: false, error: "Unauthorized." })
    expect(await db.eventOccurrence.findUnique({ where: { id: occurrence.id } })).toMatchObject({ isOpen: true, breakoutSnapshot: null })
  })

  it("returns one row per check-in with resolved names, types, and series", async () => {
    const { event } = await seedEventWithAttendance()

    const result = await getSessionsAttendanceExport(event.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.rows).toHaveLength(5)
    // Sorted by check-in time within the occurrence — volunteer checked in first
    expect(result.data.rows[0]).toMatchObject({
      sessionDate: "2026-03-01",
      seriesTitle: "March Run",
      firstName: "Vince",
      lastName: "Tan",
      mobile: "+63 917 777 8888",
      type: "Volunteer",
    })
    expect(result.data.rows[1]).toMatchObject({
      firstName: "Maria",
      lastName: "Santos",
      mobile: "+63 917 111 2222",
      type: "Member",
    })
    expect(result.data.rows[2]).toMatchObject({
      firstName: "Pedro",
      lastName: "Reyes",
      mobile: "+63 917 333 4444",
      type: "Guest",
    })
    // Walk-in falls back to the registrant's own personal fields
    expect(result.data.rows[3]).toMatchObject({
      firstName: "Ana",
      lastName: "Lopez",
      mobile: "+63 917 555 6666",
      type: "Guest",
    })
    // Sessions are ordered by date — the second session's check-in comes last
    expect(result.data.rows[4]).toMatchObject({
      sessionDate: "2026-03-08",
      firstName: "Maria",
      lastName: "Santos",
    })
  })

  it("returns only the given session's rows when an occurrenceId is passed", async () => {
    const { event, secondOccurrence } = await seedEventWithAttendance()

    const result = await getSessionsAttendanceExport(event.id, secondOccurrence.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.rows).toHaveLength(1)
    expect(result.data.rows[0]).toMatchObject({
      sessionDate: "2026-03-08",
      seriesTitle: "March Run",
      firstName: "Maria",
      lastName: "Santos",
      type: "Member",
    })
  })

  it("returns no rows when the occurrence belongs to a different event", async () => {
    const { secondOccurrence } = await seedEventWithAttendance()
    const otherEvent = await db.event.create({
      data: {
        name: "Other Event",
        type: "Recurring",
        startDate: new Date("2026-03-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    })

    const result = await getSessionsAttendanceExport(otherEvent.id, secondOccurrence.id)
    expect(result.success && result.data.rows).toEqual([])
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
    expect(result.success && result.data.rows).toEqual([])
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

  // Regression: the Events grant said "may export", but nothing said "may export
  // THIS event" — so a staffer scoped to one event could pull any other event's
  // attendance sheet, names, mobiles and emails included.
  it("rejects a staffer who may export but has no access to this event", async () => {
    const event = await db.event.create({
      data: {
        name: "Scoped Out",
        type: "Recurring",
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-01T00:00:00Z"),
      },
    })

    vi.mocked(auth).mockResolvedValue({
      user: {
        ...adminSession.user,
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Write", "Export"] }],
        eventAccess: ["some-other-event"],
      },
    } as never)

    const result = await getSessionsAttendanceExport(event.id)
    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })
})
