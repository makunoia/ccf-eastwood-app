import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { loadEventAttendanceBreakdown } from "@/lib/events/attendance-breakdown"
import {
  buildDashboardPeriod,
  occurrenceWindowWhere,
} from "@/lib/events/dashboard-period"

/**
 * A session dated ahead of today, with check-ins already recorded, must appear
 * on the event dashboard.
 *
 * The dashboard bounded its occurrence query at the end of the current UTC day
 * so not-yet-held sessions wouldn't plot as a crash to zero. The Sessions page
 * has no such bound, so an early-opened check-in desk produced two screens that
 * flatly disagreed: the session listed its attendees while "Attendance by
 * Session" said "No sessions in the selected period" and every attendance KPI
 * omitted those people.
 *
 * In PH this is a daily occurrence, not a corner case — occurrence dates are UTC
 * midnight, so a session an admin dates with today's Manila date sits a UTC day
 * ahead until 08:00 PH.
 *
 * The rule is now "hide future sessions that drew nobody", not "hide all future
 * sessions", applied to both the chart query and the breakdown so the KPIs and
 * the chart cannot disagree.
 *
 *  - integration: the occurrence query and the breakdown, against real rows
 *  - regression:  the future-dated-session-with-check-ins case, both surfaces
 *  - edge case:   empty future session still hidden; the period lower bound is
 *                 still enforced; OneTime attendance untouched
 *  - unit:        `occurrenceWindowWhere` shape — tests/unit/dashboard-period.test.ts
 *  - e2e:         skipped — the disagreement is between two server queries, and
 *                 asserting them directly is stricter than reading the chart.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "EventRegistrant",
    "Event", "Guest", "Member", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// 06:00 in Manila on 1 Aug 2026 — still 31 Jul in UTC, which is what makes a
// session dated "1 Aug" (the date the admin sees) fall outside the old window.
const PH_EARLY_MORNING = new Date("2026-07-31T22:00:00.000Z")
const EVENT_START = new Date("2026-01-15T00:00:00.000Z")

const TODAY_UTC = new Date("2026-07-31T00:00:00.000Z")
const TOMORROW_UTC = new Date("2026-08-01T00:00:00.000Z")

async function seedRecurringEvent() {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "Recurring",
      startDate: EVENT_START,
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      recurrenceDayOfWeek: 0,
      recurrenceFrequency: "Weekly",
    },
    select: { id: true },
  })
}

async function seedOccurrence(eventId: string, date: Date, isOpen = true) {
  return db.eventOccurrence.create({
    data: { eventId, date, isOpen },
    select: { id: true },
  })
}

/** A guest registrant checked in to `occurrenceId`. */
async function seedCheckedInGuest(eventId: string, occurrenceId: string, lastName: string) {
  const guest = await db.guest.create({
    data: { firstName: "Ana", lastName, language: [] },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, guestId: guest.id },
    select: { id: true },
  })
  await db.occurrenceAttendee.create({
    data: { occurrenceId, registrantId: registrant.id },
  })
  return registrant.id
}

/** The dashboard's occurrence query, verbatim. */
async function loadDashboardOccurrences(eventId: string, period: "30d" | "all" = "30d") {
  const { occurrenceRange } = buildDashboardPeriod(period, EVENT_START, PH_EARLY_MORNING)
  return db.eventOccurrence.findMany({
    where: { eventId, ...occurrenceWindowWhere(occurrenceRange) },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      _count: { select: { attendees: { where: { registrantId: { not: null } } } } },
    },
  })
}

describe("dashboard occurrence query", () => {
  it("regression — a future-dated session with check-ins is included", async () => {
    const event = await seedRecurringEvent()
    const tomorrow = await seedOccurrence(event.id, TOMORROW_UTC)
    await seedCheckedInGuest(event.id, tomorrow.id, "Reyes")

    const occurrences = await loadDashboardOccurrences(event.id)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].id).toBe(tomorrow.id)
    expect(occurrences[0]._count.attendees).toBe(1)

    // The shape of the bug, pinned: the old plain-range filter drops this
    // session entirely, while the Sessions page (no date bound at all) lists it.
    const { occurrenceRange } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)
    const withOldFilter = await db.eventOccurrence.findMany({
      where: { eventId: event.id, date: occurrenceRange },
      select: { id: true },
    })
    expect(withOldFilter).toHaveLength(0)

    const sessionsPageView = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
      select: { id: true, _count: { select: { attendees: true } } },
    })
    expect(sessionsPageView).toHaveLength(1)
    expect(sessionsPageView[0]._count.attendees).toBe(1)
  })

  it("edge case — a future-dated session with no check-ins stays hidden", async () => {
    const event = await seedRecurringEvent()
    await seedOccurrence(event.id, TOMORROW_UTC)

    expect(await loadDashboardOccurrences(event.id)).toHaveLength(0)
  })

  it("a past session with no check-ins is still a real zero inside the window", async () => {
    const event = await seedRecurringEvent()
    await seedOccurrence(event.id, TODAY_UTC)

    const occurrences = await loadDashboardOccurrences(event.id)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]._count.attendees).toBe(0)
  })

  it("edge case — the period's lower bound is still enforced", async () => {
    const event = await seedRecurringEvent()
    // 2 Jul is the oldest day of the 30d window; 1 Jul is outside it.
    const tooOld = await seedOccurrence(event.id, new Date("2026-07-01T00:00:00.000Z"))
    await seedCheckedInGuest(event.id, tooOld.id, "Cruz")

    expect(await loadDashboardOccurrences(event.id, "30d")).toHaveLength(0)
    // "All time" has no lower bound, so it comes back.
    expect(await loadDashboardOccurrences(event.id, "all")).toHaveLength(1)
  })

  it("volunteer-only check-ins keep the session visible but contribute no participants", async () => {
    const event = await seedRecurringEvent()
    const tomorrow = await seedOccurrence(event.id, TOMORROW_UTC)
    const member = await db.member.create({
      data: { firstName: "Leo", lastName: "Santos", dateJoined: new Date(), language: [] },
      select: { id: true },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Ushering", eventId: event.id },
      select: { id: true },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
      select: { id: true },
    })
    const volunteer = await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
      select: { id: true },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: tomorrow.id, volunteerId: volunteer.id },
    })

    const occurrences = await loadDashboardOccurrences(event.id)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]._count.attendees).toBe(0)
  })
})

describe("attendance breakdown agrees with the chart", () => {
  /** The dashboard's breakdown call, verbatim. */
  async function loadBreakdown(eventId: string, period: "30d" | "all" = "30d") {
    const { start, end } = buildDashboardPeriod(period, EVENT_START, PH_EARLY_MORNING)
    return loadEventAttendanceBreakdown(
      db,
      eventId,
      "Recurring",
      period === "all" ? null : start,
      end
    )
  }

  it("regression — counts attendees of a future-dated session", async () => {
    const event = await seedRecurringEvent()
    const tomorrow = await seedOccurrence(event.id, TOMORROW_UTC)
    await seedCheckedInGuest(event.id, tomorrow.id, "Reyes")
    await seedCheckedInGuest(event.id, tomorrow.id, "Lim")

    const breakdown = await loadBreakdown(event.id)

    expect(breakdown.total.attendees).toBe(2)
    expect(breakdown.total.firstTimers).toBe(2)
  })

  it("the chart total and the unique-attendee KPI agree on the same data", async () => {
    const event = await seedRecurringEvent()
    const today = await seedOccurrence(event.id, TODAY_UTC)
    const tomorrow = await seedOccurrence(event.id, TOMORROW_UTC)
    await seedCheckedInGuest(event.id, today.id, "Reyes")
    await seedCheckedInGuest(event.id, tomorrow.id, "Lim")

    const occurrences = await loadDashboardOccurrences(event.id)
    const chartTotal = occurrences.reduce((sum, o) => sum + o._count.attendees, 0)
    const breakdown = await loadBreakdown(event.id)

    expect(chartTotal).toBe(2)
    expect(breakdown.total.attendees).toBe(2)
  })

  it("edge case — the lower bound still applies to the breakdown", async () => {
    const event = await seedRecurringEvent()
    const tooOld = await seedOccurrence(event.id, new Date("2026-07-01T00:00:00.000Z"))
    await seedCheckedInGuest(event.id, tooOld.id, "Cruz")

    expect((await loadBreakdown(event.id, "30d")).total.attendees).toBe(0)
    expect((await loadBreakdown(event.id, "all")).total.attendees).toBe(1)
  })

  it("OneTime attendance is unaffected — attendedAt keeps both bounds", async () => {
    const event = await db.event.create({
      data: {
        name: "Feast",
        type: "OneTime",
        startDate: EVENT_START,
        endDate: EVENT_START,
      },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "Ana", lastName: "Reyes", language: [] },
      select: { id: true },
    })
    const { start, end } = buildDashboardPeriod("30d", EVENT_START, PH_EARLY_MORNING)

    // Attended "tomorrow" — impossible in practice, and still excluded, because
    // attendedAt is a real timestamp rather than a UTC-midnight session date.
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, attendedAt: TOMORROW_UTC },
    })

    const breakdown = await loadEventAttendanceBreakdown(db, event.id, "OneTime", start, end)
    expect(breakdown.total.attendees).toBe(0)
  })
})
