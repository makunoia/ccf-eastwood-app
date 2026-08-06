import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import {
  getClusterOverview,
  getClusterRegistrationExportRows,
  getClusterSharedFormPeopleCounts,
} from "@/lib/clusters/aggregate"

/**
 * Event Cluster dashboard accuracy.
 *
 * Two defects, both from a cluster being one day while its figures were not:
 *
 *  1. Registration was never day-scoped. A Recurring event's `EventRegistrant`
 *     is one row per person per SERIES, so every person who ever registered for
 *     the weekly service counted toward every cluster day containing it — and
 *     the figure grew retroactively as new people registered later.
 *  2. "Via shared form" counted registration ROWS while the tiles beside it
 *     counted people (one person ticking three events read as 3), and it missed
 *     anyone whose registration row already existed, because provenance was only
 *     stamped on create — a returning walk-in through the day link was invisible.
 *
 *  - integration: day-scoped roll-up, series total kept separately, people-based
 *                 day-link count, provenance stamped on the reuse path
 *  - regression:  both defects above, pinned directly
 *  - edge case:   dateless cluster stays unscoped; OneTime keeps every registrant
 *  - unit:        the scope rule itself in tests/unit/cluster-day-scope
 *  - e2e:         skipped — these are server-computed figures with no new
 *                 interaction; the browser adds nothing over the assertions here
 */

const admin = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-08-02T00:00:00Z")

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedCluster(date: Date | null = DAY) {
  return db.eventCluster.create({
    data: { name: "Sunday, Aug 2", date, isOpen: true },
  })
}

async function attach(clusterId: string, eventId: string, order = 0) {
  await db.eventClusterEvent.create({ data: { clusterId, eventId, order } })
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

async function seedOneTime(name: string) {
  return db.event.create({
    data: { name, type: "OneTime", startDate: DAY, endDate: DAY },
  })
}

/** A guest with a standing registration for `eventId`, made long ago. */
async function seedStandingRegistrant(eventId: string, tag: string) {
  const guest = await db.guest.create({
    data: { firstName: tag, lastName: "Test", language: [] },
  })
  return db.eventRegistrant.create({
    data: {
      eventId,
      guestId: guest.id,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
  })
}

describe("day scoping for session events", () => {
  it("regression — a recurring event's standing roster is not the day's roster", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    await attach(cluster.id, service.id)

    // Five people registered for the weekly service back in February …
    const standing = []
    for (let i = 0; i < 5; i++) {
      standing.push(await seedStandingRegistrant(service.id, `G${i}`))
    }
    // … two of whom actually turn up on the cluster's date.
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: service.id, date: DAY },
    })
    for (const r of standing.slice(0, 2)) {
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: r.id },
      })
    }

    const overview = await getClusterOverview(admin, cluster.id)

    expect(overview.totals.uniquePeople).toBe(2)
    expect(overview.totals.checkedInPeople).toBe(2)
    expect(overview.roster.rows).toHaveLength(2)
    expect(overview.eventStats[0]).toMatchObject({
      registered: 2,
      checkedIn: 2,
      // The standing roster is still reported — just not as the day.
      seriesRegistered: 5,
    })
  })

  it("counts a session registrant who signed up through the day link but hasn't arrived", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    await attach(cluster.id, service.id)
    await seedStandingRegistrant(service.id, "Standing")

    const result = await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      [service.id]
    )
    expect(result.success).toBe(true)

    const overview = await getClusterOverview(admin, cluster.id)
    // Signing up through the day's link is a statement of intent for the day,
    // whenever it was made — so they count before they arrive.
    expect(overview.totals.uniquePeople).toBe(1)
    expect(overview.totals.checkedInPeople).toBe(0)
    expect(overview.eventStats[0]).toMatchObject({ registered: 1, seriesRegistered: 2 })
  })

  it("edge case — a OneTime event keeps every registrant, arrived or not", async () => {
    const cluster = await seedCluster()
    const feast = await seedOneTime("Feast")
    await attach(cluster.id, feast.id)
    await seedStandingRegistrant(feast.id, "Ana")
    await seedStandingRegistrant(feast.id, "Ben")

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.totals.uniquePeople).toBe(2)
    expect(overview.eventStats[0]).toMatchObject({
      registered: 2,
      seriesRegistered: 2,
      checkedIn: 0,
    })
  })

  it("edge case — a dateless cluster keeps the unscoped roll-up", async () => {
    const cluster = await seedCluster(null)
    const service = await seedRecurring()
    await attach(cluster.id, service.id)
    await seedStandingRegistrant(service.id, "Standing")

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.totals.uniquePeople).toBe(1)
  })

  it("scopes the CSV export the same way as the screen it is launched from", async () => {
    const cluster = await seedCluster()
    const service = await seedRecurring()
    await attach(cluster.id, service.id)
    const standing = await seedStandingRegistrant(service.id, "Standing")
    const present = await seedStandingRegistrant(service.id, "Present")
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: service.id, date: DAY },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, registrantId: present.id },
    })

    const rows = await getClusterRegistrationExportRows(admin, cluster.id)
    expect(rows.map((r) => r.firstName)).toEqual(["Present"])
    expect(standing.id).toBeDefined()
  })
})

describe("via day link", () => {
  it("counts people, not registrations", async () => {
    const cluster = await seedCluster()
    const events = []
    for (const name of ["Service", "Youth Night", "Prayer"]) {
      const event = await seedOneTime(name)
      await attach(cluster.id, event.id, events.length)
      events.push(event)
    }

    // ONE person picking all three events on the shared link.
    const result = await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      events.map((e) => e.id)
    )
    expect(result.success).toBe(true)
    // A second person registering through one event's own form.
    await createRegistrant(
      events[0].id,
      { firstName: "Ana", lastName: "Lopez", mobileNumber: "0917 555 6666" },
      null
    )

    const overview = await getClusterOverview(admin, cluster.id)
    expect(overview.totals.registrations).toBe(4)
    expect(overview.totals.uniquePeople).toBe(2)
    // Regression: this was 3 — one person's three rows — sitting next to a
    // "people" figure of 2, so the tile could read higher than the total.
    expect(overview.totals.viaSharedLinkPeople).toBe(1)
  })

  it("regression — a returning person walked in through the day link is counted", async () => {
    const cluster = await seedCluster()
    const feast = await seedOneTime("Feast")
    await attach(cluster.id, feast.id)

    // Registers ahead of time through the EVENT's own form …
    const first = await createRegistrant(
      feast.id,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null
    )
    expect(first.success).toBe(true)

    const before = await getClusterOverview(admin, cluster.id)
    expect(before.totals.viaSharedLinkPeople).toBe(0)

    // … then arrives and is walked in through the cluster's shared link. The
    // registration row is reused, so provenance has to be stamped on update.
    const second = await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      [feast.id],
      true
    )
    expect(second.success).toBe(true)

    const after = await getClusterOverview(admin, cluster.id)
    expect(after.totals.viaSharedLinkPeople).toBe(1)
    expect(after.totals.registrations).toBe(1)
    expect(after.totals.checkedInPeople).toBe(1)
  })

  it("does not overwrite provenance from an earlier day link", async () => {
    const cluster = await seedCluster()
    const feast = await seedOneTime("Feast")
    await attach(cluster.id, feast.id)

    const registered = await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      [feast.id]
    )
    expect(registered.success).toBe(true)

    // Walking the same person in again must leave the original stamp alone.
    await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      [feast.id],
      true
    )

    const rows = await db.eventRegistrant.findMany({
      select: { registrationClusterId: true },
    })
    expect(rows).toEqual([{ registrationClusterId: cluster.id }])
  })
})

describe("clusters list count", () => {
  it("counts people, not registration rows, per cluster", async () => {
    const cluster = await seedCluster()
    const events = [await seedOneTime("Feast"), await seedOneTime("Talk")]
    await attach(cluster.id, events[0].id, 0)
    await attach(cluster.id, events[1].id, 1)

    // One person ticks both events on the shared form — two registration rows.
    const both = await registerForCluster(
      cluster.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      events.map((e) => e.id)
    )
    expect(both.success).toBe(true)
    // A second person takes one event only.
    const one = await registerForCluster(
      cluster.publicToken,
      { firstName: "Ana", lastName: "Lopez", mobileNumber: "0917 555 6666" },
      null,
      null,
      undefined,
      [events[0].id]
    )
    expect(one.success).toBe(true)

    const counts = await getClusterSharedFormPeopleCounts([cluster.id])
    // Regression: the list column showed 3 here — the registration rows — while
    // only two people had signed up.
    expect(counts.get(cluster.id)).toBe(2)
  })

  it("keeps clusters separate and omits registrations made outside the shared form", async () => {
    const [a, b] = [await seedCluster(), await seedCluster()]
    const feast = await seedOneTime("Feast")
    const talk = await seedOneTime("Talk")
    await attach(a.id, feast.id)
    await attach(b.id, talk.id)

    await registerForCluster(
      a.publicToken,
      { firstName: "Juan", lastName: "Cruz", mobileNumber: "0917 123 4567" },
      null,
      null,
      undefined,
      [feast.id]
    )
    // Registered through the event's own form — no cluster provenance.
    await createRegistrant(
      talk.id,
      { firstName: "Ana", lastName: "Lopez", mobileNumber: "0917 555 6666" },
      null
    )

    const counts = await getClusterSharedFormPeopleCounts([a.id, b.id])
    expect(counts.get(a.id)).toBe(1)
    expect(counts.get(b.id) ?? 0).toBe(0)
  })

  it("edge case — no clusters queries nothing", async () => {
    expect(await getClusterSharedFormPeopleCounts([])).toEqual(new Map())
  })
})
