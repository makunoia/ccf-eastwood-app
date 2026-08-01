import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { buildAttendanceSeries } from "@/lib/events/attendance-series"
import { buildDashboardPeriod } from "@/lib/events/dashboard-period"
import { loadEventAttendanceBreakdown } from "@/lib/events/attendance-breakdown"

/**
 * The "Attendance by Session" chart, end to end against real rows.
 *
 * Pure aggregation lives in tests/unit/attendance-series.test.ts and the window
 * maths in tests/unit/dashboard-period.test.ts; what is pinned here is the part
 * only the database can prove — that the period filter selects the sessions the
 * admin expects, and that volunteer check-ins stay out of the participant count.
 */

// 06:00 Manila on 1 Aug 2026 — still 31 Jul in UTC, the window that used to
// hide the day's own session.
const NOW = new Date("2026-07-31T22:00:00.000Z")
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function loadChart(eventId: string, eventStart: Date, period: "30d" | "all") {
  const { occurrenceRange } = buildDashboardPeriod(period, eventStart, NOW)

  const occurrences = await db.eventOccurrence.findMany({
    where: { eventId, date: occurrenceRange },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      _count: { select: { attendees: { where: { registrantId: { not: null } } } } },
    },
  })

  const volunteerCheckIns =
    occurrences.length === 0
      ? []
      : await db.occurrenceAttendee.groupBy({
          by: ["occurrenceId"],
          where: {
            volunteerId: { not: null },
            occurrenceId: { in: occurrences.map((o) => o.id) },
          },
          _count: { _all: true },
        })

  return buildAttendanceSeries(
    occurrences.map((o) => ({ occurrenceId: o.id, date: o.date, attendees: o._count.attendees })),
    new Map(volunteerCheckIns.map((row) => [row.occurrenceId, row._count._all])),
  )
}

describe("Attendance by Session chart", () => {
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function seedEvent(startDate: Date) {
    return db.event.create({
      data: {
        name: "Midweek Service",
        type: "Recurring",
        startDate,
        endDate: day("2026-12-31"),
      },
    })
  }

  async function seedRegistrant(eventId: string, firstName: string) {
    return db.eventRegistrant.create({
      data: { eventId, firstName, lastName: "Tester" },
    })
  }

  async function seedVolunteer(eventId: string, firstName: string) {
    const member = await db.member.create({
      data: { firstName, lastName: "Server", dateJoined: new Date(), language: [] },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Ushers", eventId } })
    const role = await db.committeeRole.create({
      data: { name: `Usher ${firstName}`, committeeId: committee.id },
    })
    return db.volunteer.create({
      data: {
        memberId: member.id,
        eventId,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })
  }

  // Regression: occurrence dates sit at UTC midnight while the upper bound was
  // `new Date()`, so today's session was invisible until 08:00 PH.
  it("includes today's session while it is still morning in Manila", async () => {
    const event = await seedEvent(day("2026-07-01"))
    const today = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-07-31") },
    })
    const registrant = await seedRegistrant(event.id, "Ana")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: today.id, registrantId: registrant.id },
    })

    const series = await loadChart(event.id, event.startDate, "30d")

    expect(series.points).toHaveLength(1)
    expect(series.points[0].date).toBe("2026-07-31T00:00:00.000Z")
    expect(series.totalAttendees).toBe(1)
  })

  // Regression: the lower bound carried the current time-of-day, so the oldest
  // day of the window fell just outside it.
  // The 30-day window counts today as one of the 30, so it opens on 2 Jul; a
  // session on 1 Jul is genuinely outside it.
  it("includes the oldest day of a 30-day window and excludes the day before it", async () => {
    const event = await seedEvent(day("2026-01-01"))
    const oldest = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-07-02") },
    })
    const justOutside = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-07-01") },
    })
    const registrant = await seedRegistrant(event.id, "Ben")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: oldest.id, registrantId: registrant.id },
    })
    const earlier = await seedRegistrant(event.id, "Bea")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: justOutside.id, registrantId: earlier.id },
    })

    const series = await loadChart(event.id, event.startDate, "30d")

    expect(series.points.map((p) => p.date)).toEqual(["2026-07-02T00:00:00.000Z"])
    expect(series.totalAttendees).toBe(1)
  })

  it("excludes sessions scheduled in the future", async () => {
    const event = await seedEvent(day("2026-07-01"))
    await db.eventOccurrence.create({ data: { eventId: event.id, date: day("2026-08-05") } })
    await db.eventOccurrence.create({ data: { eventId: event.id, date: day("2026-07-29") } })

    const series = await loadChart(event.id, event.startDate, "all")

    expect(series.points.map((p) => p.date)).toEqual(["2026-07-29T00:00:00.000Z"])
    expect(series.sessionCount).toBe(1)
  })

  // Regression: "all time" anchored its lower bound to Event.startDate, so a
  // standalone session dated earlier disappeared from the chart.
  it("counts a standalone session dated before the event start under all time", async () => {
    const event = await seedEvent(day("2026-07-01"))
    const early = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-06-20"), isStandalone: true },
    })
    const registrant = await seedRegistrant(event.id, "Cara")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: early.id, registrantId: registrant.id },
    })

    const series = await loadChart(event.id, event.startDate, "all")

    expect(series.points.map((p) => p.date)).toEqual(["2026-06-20T00:00:00.000Z"])
    expect(series.totalAttendees).toBe(1)

    // The life-stage breakdown shares the window and must agree.
    const { total } = await loadEventAttendanceBreakdown(db, event.id, "Recurring", null, NOW)
    expect(total.attendees).toBe(1)
  })

  it("separates volunteer check-ins from participants and reconciles to the Sessions total", async () => {
    const event = await seedEvent(day("2026-07-01"))
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-07-29") },
    })

    for (const name of ["Dee", "Eli", "Fay"]) {
      const registrant = await seedRegistrant(event.id, name)
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })
    }
    for (const name of ["Gil", "Hana"]) {
      const volunteer = await seedVolunteer(event.id, name)
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, volunteerId: volunteer.id },
      })
    }

    const series = await loadChart(event.id, event.startDate, "all")
    const point = series.points[0]

    expect(point.attendees).toBe(3)
    expect(point.volunteers).toBe(2)

    // What the Sessions page badge counts — every check-in row on the occurrence.
    const sessionsBadge = await db.occurrenceAttendee.count({
      where: { occurrenceId: occurrence.id },
    })
    expect(point.totalCheckIns).toBe(sessionsBadge)
  })

  it("keeps a session nobody attended on the chart as a real zero", async () => {
    const event = await seedEvent(day("2026-07-01"))
    const attended = await db.eventOccurrence.create({
      data: { eventId: event.id, date: day("2026-07-15") },
    })
    await db.eventOccurrence.create({ data: { eventId: event.id, date: day("2026-07-22") } })

    const registrant = await seedRegistrant(event.id, "Ivy")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: attended.id, registrantId: registrant.id },
    })

    const series = await loadChart(event.id, event.startDate, "all")

    expect(series.points.map((p) => p.attendees)).toEqual([1, 0])
    expect(series.sessionCount).toBe(2)
    expect(series.averageAttendance).toBe(0.5)
  })
})
