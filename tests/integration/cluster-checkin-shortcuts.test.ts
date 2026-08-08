import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  getAccessibleClusterEvents,
  getClusterCheckinShortcuts,
} from "@/lib/clusters/aggregate"

/**
 * The Shortcuts section on the cluster check-in board.
 *
 * The board records nothing — attendance happens on each event's own public
 * form — so it now offers every event's check-in link next to walk-in, instead
 * of walk-in alone. This covers which SESSION each link resolves to, which is
 * the part a pure test can't see.
 *
 *  - integration: linked session wins, unlinked session events fall back to the
 *                 cluster date, OneTime reads its Public access switch, order
 *                 follows the cluster
 *  - edge case:   a dateless cluster, a day with no occurrence, and a session
 *                 belonging to a different date than the cluster
 *  - unit:        the open/closed rules in tests/unit/cluster-checkin-shortcuts
 *  - e2e:         skipped — a server-rendered list of links; the assertions here
 *                 cover the hrefs the browser would show
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-08-09T00:00:00Z")
const OTHER_DAY = new Date("2026-08-02T00:00:00Z")

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "EventRegistrant",
    "FormConfig", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member"
    RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name: string, type: "OneTime" | "MultiDay" | "Recurring") {
  return db.event.create({
    data: {
      name,
      type,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  })
}

/** Build the shortcuts exactly as the page does. */
async function shortcutsFor(clusterId: string, date: Date | null) {
  const events = await getAccessibleClusterEvents(adminSession, clusterId)
  return getClusterCheckinShortcuts(events, date)
}

describe("getClusterCheckinShortcuts", () => {
  it("points a linked Recurring event at the session the cluster names", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Sunday", date: DAY, isOpen: true },
    })
    const event = await seedEvent("Sunday Service", "Recurring")
    const named = await db.eventOccurrence.create({
      data: { eventId: event.id, date: DAY, isOpen: true },
    })
    // A decoy on the same date must not win over the explicit link.
    const other = await db.eventOccurrence.create({
      data: { eventId: event.id, date: OTHER_DAY, isOpen: true },
    })
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order: 0, occurrenceId: named.id },
    })

    const [shortcut] = await shortcutsFor(cluster.id, DAY)
    expect(shortcut.href).toBe(`/events/${event.id}/checkin/${named.id}`)
    expect(shortcut.href).not.toContain(other.id)
    expect(shortcut.status).toBe("open")
    expect(shortcut.sessionDate?.toISOString()).toBe(DAY.toISOString())
  })

  it("falls back to the cluster date's occurrence when the link names no session", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Sunday", date: DAY, isOpen: true },
    })
    const event = await seedEvent("Sunday Service", "Recurring")
    await db.eventOccurrence.create({
      data: { eventId: event.id, date: OTHER_DAY, isOpen: true },
    })
    const today = await db.eventOccurrence.create({
      data: { eventId: event.id, date: DAY, isOpen: true },
    })
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order: 0 },
    })

    const [shortcut] = await shortcutsFor(cluster.id, DAY)
    expect(shortcut.href).toBe(`/events/${event.id}/checkin/${today.id}`)
    expect(shortcut.sessionDate?.toISOString()).toBe(DAY.toISOString())
  })

  it("reports no session when the cluster's day has none", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Sunday", date: DAY, isOpen: true },
    })
    const event = await seedEvent("Camp", "MultiDay")
    await db.eventOccurrence.create({
      data: { eventId: event.id, date: OTHER_DAY, isOpen: true },
    })
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order: 0 },
    })

    const [shortcut] = await shortcutsFor(cluster.id, DAY)
    expect(shortcut).toMatchObject({
      href: null,
      status: "noSession",
      sessionDate: null,
      manageHref: `/event/${event.id}/sessions`,
    })
  })

  it("has no session to fall back to on a dateless cluster", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Untimed", date: null, isOpen: true },
    })
    const event = await seedEvent("Sunday Service", "Recurring")
    await db.eventOccurrence.create({
      data: { eventId: event.id, date: DAY, isOpen: true },
    })
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order: 0 },
    })

    const [shortcut] = await shortcutsFor(cluster.id, null)
    expect(shortcut.status).toBe("noSession")
    expect(shortcut.href).toBeNull()
  })

  it("reads the Public access switch for a OneTime event", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Sunday", date: DAY, isOpen: true },
    })
    const open = await seedEvent("Baptism", "OneTime")
    const closed = await seedEvent("Embarkation", "OneTime")
    await db.formConfig.create({
      data: {
        scopeKey: `EventCheckIn:${closed.id}`,
        key: "EventCheckIn",
        eventId: closed.id,
        isOpen: false,
      },
    })
    await db.eventClusterEvent.createMany({
      data: [
        { clusterId: cluster.id, eventId: open.id, order: 0 },
        { clusterId: cluster.id, eventId: closed.id, order: 1 },
      ],
    })

    const shortcuts = await shortcutsFor(cluster.id, DAY)
    // Cluster order, so the day's links read in the order the day runs.
    expect(shortcuts.map((s) => s.eventId)).toEqual([open.id, closed.id])
    // A missing FormConfig row means open.
    expect(shortcuts[0]).toMatchObject({
      href: `/events/${open.id}/checkin`,
      status: "open",
    })
    expect(shortcuts[1]).toMatchObject({
      href: null,
      status: "formClosed",
      manageHref: `/event/${closed.id}/forms/EventCheckIn`,
    })
  })

  it("returns nothing for a cluster with no events", async () => {
    const cluster = await db.eventCluster.create({
      data: { name: "Empty", date: DAY, isOpen: true },
    })
    expect(await shortcutsFor(cluster.id, DAY)).toEqual([])
  })
})
