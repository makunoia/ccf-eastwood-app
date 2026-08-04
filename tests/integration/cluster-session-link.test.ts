import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  addEventToCluster,
  removeEventFromCluster,
  setClusterEventSession,
  updateEventCluster,
} from "@/app/(dashboard)/events/cluster-actions"
import {
  getClusterOverview,
  getClusterRegistrationExportRows,
} from "@/lib/clusters/aggregate"

/**
 * Session selection for cluster-linked Recurring events.
 *
 * A cluster is one day, but a Recurring event is a series — so the link now
 * names WHICH session the day stands for, and every day figure (dashboard,
 * roster, check-in board, CSV export) reads that session. Changing the session
 * changes all of them.
 *
 *  - integration: linking with a session, switching sessions, figures following
 *                 the switch, export agreeing with the screen
 *  - regression:  a link made before session selection existed (occurrenceId
 *                 null) keeps the exact date-window behavior it had, and none
 *                 of its rows are touched — this is the production-data promise
 *  - edge case:   MultiDay refused, date mismatch refused, session belonging to
 *                 another event refused, deleting the session degrades the link
 *                 instead of breaking it, moving the cluster date is blocked
 *                 while a session is pinned elsewhere
 *  - unit:        the link rules themselves in tests/unit/cluster-event-link
 *  - e2e:         skipped — server-computed figures behind two selects; the
 *                 assertions here cover the behavior the browser would show
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-08-02T00:00:00Z")
const NEXT_WEEK = new Date("2026-08-09T00:00:00Z")
const LAST_WEEK = new Date("2026-07-26T00:00:00Z")

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member"
    RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedCluster(date: Date | null = DAY) {
  return db.eventCluster.create({ data: { name: "Sunday, Aug 2", date, isOpen: true } })
}

async function seedRecurring(name = "Sunday Service") {
  return db.event.create({
    data: {
      name,
      type: "Recurring",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  })
}

async function seedSession(eventId: string, date: Date) {
  return db.eventOccurrence.create({ data: { eventId, date } })
}

/** A guest registered for the series, optionally checked into a session. */
async function seedAttendee(
  eventId: string,
  name: string,
  occurrenceId?: string
) {
  const guest = await db.guest.create({
    data: { firstName: name, lastName: "Test", language: [] },
  })
  const registrant = await db.eventRegistrant.create({
    data: {
      eventId,
      guestId: guest.id,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
  })
  if (occurrenceId) {
    await db.occurrenceAttendee.create({
      data: { occurrenceId, registrantId: registrant.id },
    })
  }
  return registrant
}

describe("linking a recurring event through a session", () => {
  it("stores the chosen session on the link", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    const session = await seedSession(service.id, DAY)

    const result = await addEventToCluster(cluster.id, service.id, session.id)
    expect(result.success).toBe(true)

    const link = await db.eventClusterEvent.findUnique({
      where: { clusterId_eventId: { clusterId: cluster.id, eventId: service.id } },
      select: { occurrenceId: true },
    })
    expect(link?.occurrenceId).toBe(session.id)
  })

  it("refuses a recurring event with no session named", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    await seedSession(service.id, DAY)

    const result = await addEventToCluster(cluster.id, service.id)
    expect(result).toEqual({
      success: false,
      error: "Pick which session of Sunday Service this day is for.",
    })
    expect(await db.eventClusterEvent.count()).toBe(0)
  })

  it("refuses a session on a different date from the cluster", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    const wrongWeek = await seedSession(service.id, NEXT_WEEK)

    const result = await addEventToCluster(cluster.id, service.id, wrongWeek.id)
    expect(result.success).toBe(false)
    expect(await db.eventClusterEvent.count()).toBe(0)
  })

  it("refuses a session that belongs to another event", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    const other = await seedRecurring("Prayer Meeting")
    const otherSession = await seedSession(other.id, DAY)

    const result = await addEventToCluster(cluster.id, service.id, otherSession.id)
    expect(result.success).toBe(false)
    expect(await db.eventClusterEvent.count()).toBe(0)
  })

  it("refuses a multi-day event entirely", async () => {
    const cluster = await seedCluster()
    const camp = await db.event.create({
      data: {
        name: "Camp",
        type: "MultiDay",
        startDate: DAY,
        endDate: new Date("2026-08-04T00:00:00Z"),
      },
    })

    const result = await addEventToCluster(cluster.id, camp.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("multi-day")
    expect(await db.eventClusterEvent.count()).toBe(0)
  })

  it("refuses a one-time event on another date", async () => {
    const cluster = await seedCluster()
    const feast = await db.event.create({
      data: { name: "Feast", type: "OneTime", startDate: NEXT_WEEK, endDate: NEXT_WEEK },
    })

    const result = await addEventToCluster(cluster.id, feast.id)
    expect(result.success).toBe(false)
    expect(await db.eventClusterEvent.count()).toBe(0)
  })
})

describe("changing the session moves the day's figures", () => {
  async function seedTwoSessionCluster() {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    const thisWeek = await seedSession(service.id, DAY)
    const lastWeek = await seedSession(service.id, LAST_WEEK)

    // Three people on the standing roster: one at each session, one at neither.
    await seedAttendee(service.id, "ThisWeek", thisWeek.id)
    await seedAttendee(service.id, "LastWeek", lastWeek.id)
    await seedAttendee(service.id, "Absent")

    await addEventToCluster(cluster.id, service.id, thisWeek.id)
    return { cluster, service, thisWeek, lastWeek }
  }

  it("counts only the linked session's attendees", async () => {
    const { cluster } = await seedTwoSessionCluster()

    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.roster.rows.map((p) => p.firstName)).toEqual(["ThisWeek"])
    expect(overview.totals.uniquePeople).toBe(1)
    expect(overview.totals.checkedInPeople).toBe(1)
    expect(overview.eventStats[0]).toMatchObject({
      registered: 1,
      checkedIn: 1,
      seriesRegistered: 3,
    })
  })

  it("follows the link to a different session", async () => {
    const { cluster, service, lastWeek } = await seedTwoSessionCluster()
    // The cluster date has to move with it — a day is a day.
    await db.eventCluster.update({
      where: { id: cluster.id },
      data: { date: LAST_WEEK },
    })

    const result = await setClusterEventSession(cluster.id, service.id, lastWeek.id)
    expect(result.success).toBe(true)

    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.roster.rows.map((p) => p.firstName)).toEqual(["LastWeek"])
    expect(overview.eventStats[0]).toMatchObject({ registered: 1, checkedIn: 1 })
  })

  it("carries the same scope into the CSV export", async () => {
    const { cluster } = await seedTwoSessionCluster()

    const rows = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(rows.map((r) => r.firstName)).toEqual(["ThisWeek"])
    expect(rows[0].checkedIn).toBe(true)
  })

  it("reports the linked session's date on the event tile", async () => {
    const { cluster, thisWeek } = await seedTwoSessionCluster()

    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.eventStats[0].linkedOccurrenceDate?.toISOString()).toBe(
      thisWeek.date.toISOString()
    )
  })

  it("edge case — deleting the session degrades the link instead of breaking it", async () => {
    const { cluster, service, thisWeek } = await seedTwoSessionCluster()

    await db.eventOccurrence.delete({ where: { id: thisWeek.id } })

    const link = await db.eventClusterEvent.findUnique({
      where: { clusterId_eventId: { clusterId: cluster.id, eventId: service.id } },
      select: { occurrenceId: true },
    })
    expect(link).not.toBeNull()
    expect(link?.occurrenceId).toBeNull()

    // Back to date-window behavior, and still readable.
    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.eventStats[0].linkedOccurrenceDate).toBeNull()
  })

  it("edge case — moving the cluster date is blocked while a session is pinned elsewhere", async () => {
    const { cluster } = await seedTwoSessionCluster()

    const result = await updateEventCluster(cluster.id, { date: NEXT_WEEK })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("pinned to a session on another date")

    const unchanged = await db.eventCluster.findUnique({
      where: { id: cluster.id },
      select: { date: true },
    })
    expect(unchanged?.date?.toISOString()).toBe(DAY.toISOString())
  })

  it("removing the event drops the link and leaves every registration alone", async () => {
    const { cluster, service } = await seedTwoSessionCluster()

    const result = await removeEventFromCluster(cluster.id, service.id)
    expect(result.success).toBe(true)
    expect(await db.eventClusterEvent.count()).toBe(0)
    expect(await db.eventRegistrant.count()).toBe(3)
    expect(await db.occurrenceAttendee.count()).toBe(2)
  })
})

describe("existing clusters are untouched", () => {
  /**
   * The production promise. A cluster linked before session selection existed
   * has `occurrenceId = null` on every link, and must behave exactly as it did:
   * figures come from the cluster's date window, nothing is refused, and no
   * registration or attendance row is rewritten.
   */
  async function seedLegacyCluster() {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    // A link with no session — exactly what the migration leaves behind.
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: service.id, order: 0 },
    })
    const thisWeek = await seedSession(service.id, DAY)
    const lastWeek = await seedSession(service.id, LAST_WEEK)
    await seedAttendee(service.id, "ThisWeek", thisWeek.id)
    await seedAttendee(service.id, "LastWeek", lastWeek.id)
    await seedAttendee(service.id, "Absent")
    return { cluster, service }
  }

  it("regression — a legacy link still counts by the cluster's date window", async () => {
    const { cluster } = await seedLegacyCluster()

    const overview = await getClusterOverview(adminSession, cluster.id)
    // Same answer the date-window rule gave before session selection shipped:
    // whoever attended on the cluster's date.
    expect(overview.roster.rows.map((p) => p.firstName)).toEqual(["ThisWeek"])
    expect(overview.totals.checkedInPeople).toBe(1)
    expect(overview.eventStats[0]).toMatchObject({
      registered: 1,
      checkedIn: 1,
      seriesRegistered: 3,
      linkedOccurrenceDate: null,
    })
  })

  it("regression — reading a legacy cluster rewrites nothing", async () => {
    const { cluster } = await seedLegacyCluster()

    const before = await db.eventRegistrant.findMany({
      orderBy: { id: "asc" },
      select: { id: true, registrationClusterId: true, attendedAt: true },
    })
    const linksBefore = await db.eventClusterEvent.findMany({
      select: { clusterId: true, eventId: true, occurrenceId: true, order: true },
    })

    await getClusterOverview(adminSession, cluster.id)
    await getClusterRegistrationExportRows(adminSession, cluster.id)

    expect(
      await db.eventRegistrant.findMany({
        orderBy: { id: "asc" },
        select: { id: true, registrationClusterId: true, attendedAt: true },
      })
    ).toEqual(before)
    expect(
      await db.eventClusterEvent.findMany({
        select: { clusterId: true, eventId: true, occurrenceId: true, order: true },
      })
    ).toEqual(linksBefore)
    expect(await db.occurrenceAttendee.count()).toBe(2)
  })

  it("regression — a legacy dateless cluster keeps its unscoped roll-up", async () => {
    const cluster = await seedCluster(null)
    const service = await seedRecurring()
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: service.id, order: 0 },
    })
    await seedAttendee(service.id, "One")
    await seedAttendee(service.id, "Two")

    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.totals.uniquePeople).toBe(2)
  })

  it("a legacy link can be upgraded to a session without touching its data", async () => {
    const { cluster, service } = await seedLegacyCluster()
    const thisWeek = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: service.id, date: DAY },
    })
    const registrantsBefore = await db.eventRegistrant.count()

    const result = await setClusterEventSession(cluster.id, service.id, thisWeek.id)
    expect(result.success).toBe(true)

    const overview = await getClusterOverview(adminSession, cluster.id)
    expect(overview.eventStats[0].linkedOccurrenceDate?.toISOString()).toBe(
      DAY.toISOString()
    )
    expect(await db.eventRegistrant.count()).toBe(registrantsBefore)
  })
})
