import { describe, it, expect, beforeEach, afterAll } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import { getClusterOverview, getClusterRegistrantRows } from "@/lib/clusters/aggregate"

/**
 * Registration must never mark attendance.
 *
 * Two bugs inflated every check-in figure that reads occurrence attendance —
 * most visibly the Event Cluster dashboard's "Checked in" tile:
 *
 *  1. `completeEventRegistration` called `autoCheckinIfOpenRecurringSession` on
 *     the non-walk-in branch, so a plain pre-registration on a Recurring event
 *     silently wrote an `OccurrenceAttendee` whenever ANY session was left open.
 *     `isOpen` is a manual toggle nothing auto-closes, so a session left open
 *     weeks ago kept catching new registrations.
 *  2. The cluster roll-up counted a registrant as checked in if they had ANY
 *     occurrence attendance ever — a cluster is one day, but a Recurring event's
 *     occurrences span many, so last week's attendees showed on today's roster.
 *
 *  - integration: registration (single-event, cluster fan-out, both person
 *                 resolution paths) records no attendance; walk-in still does
 *  - regression:  the two bugs above, pinned directly
 *  - edge case:   dateless cluster keeps the unscoped roll-up; a cluster date
 *                 window is computed in UTC, so it holds at PH-midnight offsets
 *  - unit/e2e:    skipped — there is no new pure logic beyond the UTC day
 *                 window (covered here against real rows), and the browser flow
 *                 adds nothing over the server-side assertions.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member", "SchedulePreference"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

function payload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Juan",
    lastName: "dela Cruz",
    mobileNumber: "0917 123 4567",
    ...overrides,
  }
}

async function seedRecurringEvent(name = "Sunday Service") {
  return db.event.create({
    data: {
      name,
      type: "Recurring",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      recurrenceDayOfWeek: 0,
      recurrenceFrequency: "Weekly",
    },
    select: { id: true },
  })
}

/** An occurrence with check-in left open — the state that triggered the bug. */
async function seedOpenOccurrence(eventId: string, date: Date) {
  return db.eventOccurrence.create({
    data: { eventId, date, isOpen: true },
    select: { id: true },
  })
}

async function seedCluster(
  eventIds: string[],
  overrides: Record<string, unknown> = {}
) {
  return db.eventCluster.create({
    data: {
      name: "Super Sunday",
      isOpen: true,
      events: { create: eventIds.map((eventId, order) => ({ eventId, order })) },
      ...overrides,
    },
    select: { id: true, publicToken: true },
  })
}

describe("registration never marks attendance", () => {
  it("regression — cluster registration on a Recurring event with an open session records no attendance", async () => {
    const event = await seedRecurringEvent()
    await seedOpenOccurrence(event.id, new Date("2026-08-02"))
    const cluster = await seedCluster([event.id])

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id]
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0].status).toBe("registered")

    const attendances = await db.occurrenceAttendee.count()
    expect(attendances).toBe(0)
  })

  it("regression — single-event registration on a Recurring event with an open session records no attendance", async () => {
    const event = await seedRecurringEvent()
    await seedOpenOccurrence(event.id, new Date("2026-08-02"))

    const result = await createRegistrant(event.id, payload(), null)

    expect(result.success).toBe(true)
    if (!result.success) return

    const attendances = await db.occurrenceAttendee.count({
      where: { registrantId: result.data.id },
    })
    expect(attendances).toBe(0)
  })

  it("regression — a session left open from a previous week does not catch today's registration", async () => {
    const event = await seedRecurringEvent()
    // Stale: an admin opened check-in weeks ago and never closed it.
    await seedOpenOccurrence(event.id, new Date("2026-07-05"))

    const result = await createRegistrant(event.id, payload(), null)
    expect(result.success).toBe(true)

    expect(await db.occurrenceAttendee.count()).toBe(0)
  })

  it("a confirmed member registering through the cluster form is not checked in", async () => {
    const member = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 555 1111",
        dateJoined: new Date(),
        language: [],
      },
      select: { id: true },
    })
    const event = await seedRecurringEvent()
    await seedOpenOccurrence(event.id, new Date("2026-08-02"))
    const cluster = await seedCluster([event.id])

    const result = await registerForCluster(
      cluster.publicToken,
      payload({ firstName: "Maria", lastName: "Santos", mobileNumber: "0917 555 1111" }),
      member.id,
      null,
      undefined,
      [event.id]
    )

    expect(result.success).toBe(true)
    expect(await db.occurrenceAttendee.count()).toBe(0)
  })

  it("walk-in on a OneTime cluster event still checks the person in", async () => {
    const event = await db.event.create({
      data: {
        name: "Feast",
        type: "OneTime",
        startDate: new Date("2026-08-02"),
        endDate: new Date("2026-08-02"),
      },
      select: { id: true },
    })
    const cluster = await seedCluster([event.id])

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      true
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0].checkedIn).toBe(true)

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
      select: { attendedAt: true },
    })
    expect(registrant.attendedAt).not.toBeNull()
  })
})

describe("cluster roll-up scopes attendance to the cluster's day", () => {
  // The roll-up is access-scoped — an unauthenticated caller sees no events.
  const admin = {
    user: { role: "SuperAdmin", permissions: [], eventAccess: [] },
  } as unknown as Session

  /** Registers one guest for `event` and returns the registrant id. */
  async function registerFor(eventId: string, publicToken: string) {
    const result = await registerForCluster(
      publicToken,
      payload(),
      null,
      null,
      undefined,
      [eventId]
    )
    if (!result.success) throw new Error(result.error)
    return result.data.results[0].registrantId!
  }

  it("regression — attendance on a different day is not counted as checked in", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id], { date: new Date("2026-08-02") })
    const registrantId = await registerFor(event.id, cluster.publicToken)

    // The person attended LAST week's session, not this cluster's day.
    const lastWeek = await seedOpenOccurrence(event.id, new Date("2026-07-26"))
    await db.occurrenceAttendee.create({
      data: { occurrenceId: lastWeek.id, registrantId },
    })

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.eventStats[0].checkedIn).toBe(0)
    expect(overview.totals.checkedInPeople).toBe(0)
  })

  it("attendance on the cluster's own day IS counted", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id], { date: new Date("2026-08-02") })
    const registrantId = await registerFor(event.id, cluster.publicToken)

    const today = await seedOpenOccurrence(event.id, new Date("2026-08-02"))
    await db.occurrenceAttendee.create({
      data: { occurrenceId: today.id, registrantId },
    })

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.eventStats[0].checkedIn).toBe(1)
    expect(overview.totals.checkedInPeople).toBe(1)
  })

  it("edge case — the day window is UTC, so a late-evening PH occurrence still counts", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id], { date: new Date("2026-08-02") })
    const registrantId = await registerFor(event.id, cluster.publicToken)

    // 23:30 UTC on the cluster's date — inside the UTC day, outside a naive
    // local-time window built from the same Date in a UTC+8 environment.
    const lateOccurrence = await seedOpenOccurrence(
      event.id,
      new Date("2026-08-02T23:30:00.000Z")
    )
    await db.occurrenceAttendee.create({
      data: { occurrenceId: lateOccurrence.id, registrantId },
    })

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.eventStats[0].checkedIn).toBe(1)
  })

  it("edge case — a cluster with no date keeps the unscoped roll-up", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])
    const registrantId = await registerFor(event.id, cluster.publicToken)

    const anyDay = await seedOpenOccurrence(event.id, new Date("2026-07-26"))
    await db.occurrenceAttendee.create({
      data: { occurrenceId: anyDay.id, registrantId },
    })

    const rows = await getClusterRegistrantRows([{ id: event.id }], null)
    expect(rows[0].checkedIn).toBe(true)
  })

  it("OneTime attendance is unaffected by the date scope (it uses attendedAt)", async () => {
    const event = await db.event.create({
      data: {
        name: "Feast",
        type: "OneTime",
        startDate: new Date("2026-08-02"),
        endDate: new Date("2026-08-02"),
      },
      select: { id: true },
    })
    const cluster = await seedCluster([event.id], { date: new Date("2026-08-02") })
    const registrantId = await registerFor(event.id, cluster.publicToken)

    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { attendedAt: new Date() },
    })

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.eventStats[0].checkedIn).toBe(1)
  })
})
