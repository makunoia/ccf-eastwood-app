import { describe, it, expect, beforeEach, afterAll } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import { getClusterOverview } from "@/lib/clusters/aggregate"

/**
 * Why the day roster showed "—" for someone who had plainly registered.
 *
 * A cluster is one day; a Recurring event's `EventRegistrant` is one row per
 * person per *series*. `isOnClusterDay` therefore counts a session event's
 * registration for the day only on evidence — they checked in, or they signed up
 * through this day's shared link (`registrationClusterId`).
 *
 * The bug: `registerForCluster` short-circuited on an existing registration
 * ("Already registered") and returned before `completeEventRegistration`, which
 * is the only place the reuse path stamps that column. So someone who had
 * registered through the event's own link was invisible on the day roster, and
 * registering again through the day link — the obvious fix to try — changed
 * nothing, because the stamp lived on the far side of the `continue`.
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

const CLUSTER_DATE = new Date("2026-08-09T00:00:00.000Z")

// The roll-up is access-scoped — an unauthenticated caller sees no events at all.
const admin = {
  user: { role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

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

async function seedOneTimeEvent(name = "Baptism Service") {
  return db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: CLUSTER_DATE,
      endDate: CLUSTER_DATE,
    },
    select: { id: true },
  })
}

async function seedCluster(eventIds: string[], overrides: Record<string, unknown> = {}) {
  return db.eventCluster.create({
    data: {
      name: "Super Sunday",
      date: CLUSTER_DATE,
      isOpen: true,
      events: { create: eventIds.map((eventId, order) => ({ eventId, order })) },
      ...overrides,
    },
    select: { id: true, publicToken: true },
  })
}

/** What the dashboard's roster matrix would draw for this person/event pair. */
async function rosterCell(clusterId: string, eventId: string) {
  const overview = await getClusterOverview(admin, clusterId)
  const person = overview.roster.rows[0]
  return person ? person.perEvent[eventId] : undefined
}

describe("cluster day provenance — registering again through the day link", () => {
  it("regression — stamps the day on a registration that came in through the event's own link", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])

    // Registered on the event's own form: no day provenance, no check-in.
    const first = await createRegistrant(event.id, payload(), null)
    expect(first.success).toBe(true)
    if (!first.success) return

    // The roster can't place them on the day yet. It used to drop the row here,
    // rendering "—" ("not registered") for someone plainly registered; now the
    // cell survives and says what is actually true. Their sign-up predates the
    // cluster's date, so the timestamp doesn't speak for them either.
    expect(await rosterCell(cluster.id, event.id)).toMatchObject({
      checkedIn: false,
      onClusterDay: false,
    })

    // The admin's instinct: put them through the day's shared form.
    const again = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id]
    )
    expect(again.success).toBe(true)
    if (!again.success) return
    expect(again.data.results[0].status).toBe("already")

    const stored = await db.eventRegistrant.findUniqueOrThrow({
      where: { id: first.data.id },
      select: { registrationClusterId: true },
    })
    expect(stored.registrationClusterId).toBe(cluster.id)

    // …and the roster now places them on the day, registered but not checked in.
    expect(await rosterCell(cluster.id, event.id)).toMatchObject({
      registrantId: first.data.id,
      checkedIn: false,
    })
  })

  it("counts the person under the day's totals once the stamp lands", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])

    await createRegistrant(event.id, payload(), null)
    await registerForCluster(cluster.publicToken, payload(), null, null, undefined, [event.id])

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.totals.uniquePeople).toBe(1)
    expect(overview.totals.viaSharedLinkPeople).toBe(1)
    expect(overview.eventStats[0]).toMatchObject({ registered: 1, checkedIn: 0 })
  })

  it("creates no second registration — the person stays one row on one event", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])

    await createRegistrant(event.id, payload(), null)
    await registerForCluster(cluster.publicToken, payload(), null, null, undefined, [event.id])

    expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
    expect(await db.guest.count()).toBe(1)
  })

  it("records no attendance — registering again is intent, not arrival", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])

    await createRegistrant(event.id, payload(), null)
    await registerForCluster(cluster.publicToken, payload(), null, null, undefined, [event.id])

    expect(await db.occurrenceAttendee.count()).toBe(0)
  })

  // A OneTime event's registrations are inherently the day's, so it never needed
  // the stamp to show up — but the shared "Via day link" figure reads the same
  // column, and an admin ticking both events expects both to count.
  it("stamps a OneTime event's existing registration too", async () => {
    const oneTime = await seedOneTimeEvent()
    const cluster = await seedCluster([oneTime.id])

    const first = await createRegistrant(oneTime.id, payload(), null)
    expect(first.success).toBe(true)
    if (!first.success) return

    await registerForCluster(cluster.publicToken, payload(), null, null, undefined, [oneTime.id])

    const stored = await db.eventRegistrant.findUniqueOrThrow({
      where: { id: first.data.id },
      select: { registrationClusterId: true },
    })
    expect(stored.registrationClusterId).toBe(cluster.id)
  })

  // The stamp fills a null rather than overwriting, so submitting the day's form
  // twice is a no-op on provenance. (`EventClusterEvent.eventId` is unique — an
  // event sits in at most one cluster — so there is never a second day competing
  // for the column. The guard is about not rewriting history, not arbitration.)
  it("is idempotent when the day's form is submitted twice", async () => {
    const event = await seedRecurringEvent()
    const cluster = await seedCluster([event.id])

    const first = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id]
    )
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.data.results[0].status).toBe("registered")

    const again = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id]
    )
    expect(again.success).toBe(true)
    if (!again.success) return
    expect(again.data.results[0].status).toBe("already")

    const rows = await db.eventRegistrant.findMany({
      select: { registrationClusterId: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].registrationClusterId).toBe(cluster.id)
  })
})
