import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  setClusterCheckinOpen,
  checkInToCluster,
} from "@/app/(dashboard)/events/cluster-actions"

/**
 * One switch opens the whole day's check-in.
 *
 * `EventCluster.checkInIsOpen` only ever governed the kiosk's own door; each
 * member event kept its own control (a `FormConfig` row for OneTime, an
 * `EventOccurrence.isOpen` for a session event), so opening a day meant walking
 * into every member event afterwards — and until that was done the kiosk found
 * the person and silently skipped their events.
 *
 *  - integration: the cascade writes all three controls in one call, creates and
 *                 pins a missing session, and moves the walk-in door
 *  - edge case:   a dateless cluster, closing (which must never create), an empty
 *                 day, and a staffer without access
 *  - regression:  after one call, the kiosk records every event with nothing skipped
 *  - unit:        the per-event routing rules in tests/unit/cluster-checkin-toggle
 *  - e2e:         skipped — an authenticated admin toggle with no Playwright
 *                 coverage of the cluster Forms screen today
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-08-19T00:00:00Z")

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

async function seedEvent(name: string, type: "OneTime" | "Recurring") {
  return db.event.create({
    data: {
      name,
      type,
      startDate: DAY,
      endDate: type === "OneTime" ? DAY : new Date("2026-12-31T00:00:00Z"),
    },
  })
}

async function seedCluster(date: Date | null = DAY) {
  return db.eventCluster.create({ data: { name: "Event Day", date } })
}

async function link(clusterId: string, eventId: string, occurrenceId?: string) {
  return db.eventClusterEvent.create({
    data: { clusterId, eventId, occurrenceId: occurrenceId ?? null },
  })
}

describe("setClusterCheckinOpen — opening the day", () => {
  it("opens the kiosk, a OneTime form and a linked session in one call", async () => {
    const cluster = await seedCluster()
    const oneTime = await seedEvent("Baptism", "OneTime")
    const recurring = await seedEvent("Sunday Service", "Recurring")
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: recurring.id, date: DAY },
    })
    await link(cluster.id, oneTime.id)
    await link(cluster.id, recurring.id, occurrence.id)

    // Both member events start explicitly closed.
    await db.formConfig.create({
      data: {
        scopeKey: `${oneTime.id}:EventCheckIn`,
        key: "EventCheckIn",
        eventId: oneTime.id,
        isOpen: false,
      },
    })

    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.results.map((r) => r.status).sort()).toEqual([
      "opened",
      "opened",
    ])

    const after = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    expect(after?.checkInIsOpen).toBe(true)

    const config = await db.formConfig.findUnique({
      where: { scopeKey: `${oneTime.id}:EventCheckIn` },
    })
    expect(config?.isOpen).toBe(true)

    const session = await db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    expect(session?.isOpen).toBe(true)
  })

  // A OneTime event with no FormConfig row is already open by default — the
  // cascade must still write the row, so the state is explicit rather than
  // depending on a missing row continuing to mean "open".
  it("creates the OneTime FormConfig row when none exists", async () => {
    const cluster = await seedCluster()
    const oneTime = await seedEvent("Baptism", "OneTime")
    await link(cluster.id, oneTime.id)

    await setClusterCheckinOpen(cluster.id, true)

    const config = await db.formConfig.findUnique({
      where: { scopeKey: `${oneTime.id}:EventCheckIn` },
    })
    expect(config?.isOpen).toBe(true)
  })

  it("creates, opens and pins the day's session when a session event has none", async () => {
    const cluster = await seedCluster()
    const recurring = await seedEvent("Sunday Service", "Recurring")
    await link(cluster.id, recurring.id)

    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0]).toMatchObject({
      eventId: recurring.id,
      status: "created",
    })

    const created = await db.eventOccurrence.findMany({
      where: { eventId: recurring.id },
    })
    expect(created).toHaveLength(1)
    expect(created[0].date.toISOString()).toBe("2026-08-19T00:00:00.000Z")
    expect(created[0].isOpen).toBe(true)

    // Pinned, so tomorrow's read resolves it by name instead of by date window.
    const relink = await db.eventClusterEvent.findUnique({
      where: { clusterId_eventId: { clusterId: cluster.id, eventId: recurring.id } },
    })
    expect(relink?.occurrenceId).toBe(created[0].id)
  })

  // The exact shape of the bug this repairs: a pinned session deleted out from
  // under the link (onDelete: SetNull) left the day with no way to open check-in.
  it("repairs a link whose pinned session was deleted", async () => {
    const cluster = await seedCluster()
    const recurring = await seedEvent("Sunday Service", "Recurring")
    const doomed = await db.eventOccurrence.create({
      data: { eventId: recurring.id, date: DAY },
    })
    await link(cluster.id, recurring.id, doomed.id)
    await db.eventOccurrence.delete({ where: { id: doomed.id } })

    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0].status).toBe("created")

    const relink = await db.eventClusterEvent.findUnique({
      where: { clusterId_eventId: { clusterId: cluster.id, eventId: recurring.id } },
    })
    expect(relink?.occurrenceId).not.toBeNull()
  })

  it("aims the event's walk-in door at the session it opened", async () => {
    const cluster = await seedCluster()
    const recurring = await seedEvent("Sunday Service", "Recurring")
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: recurring.id, date: DAY },
    })
    await link(cluster.id, recurring.id, occurrence.id)

    await setClusterCheckinOpen(cluster.id, true)

    const event = await db.event.findUnique({ where: { id: recurring.id } })
    expect(event?.walkInOccurrenceId).toBe(occurrence.id)
  })
})

describe("setClusterCheckinOpen — edge cases", () => {
  it("reports noDate instead of guessing a session date", async () => {
    const cluster = await seedCluster(null)
    const recurring = await seedEvent("Sunday Service", "Recurring")
    await link(cluster.id, recurring.id)

    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0]).toMatchObject({
      status: "skipped",
      reason: "noDate",
    })
    expect(await db.eventOccurrence.count()).toBe(0)

    // The kiosk still opened — the day's own door is not held hostage by a
    // member event that couldn't be resolved.
    const after = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    expect(after?.checkInIsOpen).toBe(true)
  })

  it("closes every control and creates nothing", async () => {
    const cluster = await seedCluster()
    const oneTime = await seedEvent("Baptism", "OneTime")
    const withSession = await seedEvent("Sunday Service", "Recurring")
    const sessionless = await seedEvent("Youth Night", "Recurring")
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: withSession.id, date: DAY, isOpen: true },
    })
    await link(cluster.id, oneTime.id)
    await link(cluster.id, withSession.id, occurrence.id)
    await link(cluster.id, sessionless.id)

    await setClusterCheckinOpen(cluster.id, true)
    const result = await setClusterCheckinOpen(cluster.id, false)
    expect(result.success).toBe(true)
    if (!result.success) return

    const after = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    expect(after?.checkInIsOpen).toBe(false)

    const config = await db.formConfig.findUnique({
      where: { scopeKey: `${oneTime.id}:EventCheckIn` },
    })
    expect(config?.isOpen).toBe(false)

    const sessions = await db.eventOccurrence.findMany({
      where: { eventId: { in: [withSession.id, sessionless.id] } },
    })
    expect(sessions.every((s) => !s.isOpen)).toBe(true)
    // The first open created one for Youth Night; closing must not add another.
    expect(sessions).toHaveLength(2)
  })

  it("opens a day with no events at all", async () => {
    const cluster = await seedCluster()
    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results).toEqual([])
    const after = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    expect(after?.checkInIsOpen).toBe(true)
  })

  it("refuses an unknown cluster", async () => {
    const result = await setClusterCheckinOpen("nope", true)
    expect(result.success).toBe(false)
  })

  it("refuses a caller without write access", async () => {
    const cluster = await seedCluster()
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u", role: "Staff", permissions: [], eventAccess: [] },
    } as never)

    const result = await setClusterCheckinOpen(cluster.id, true)
    expect(result.success).toBe(false)

    const after = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    expect(after?.checkInIsOpen).toBe(false)
  })
})

describe("regression — the kiosk takes the check-in after one switch", () => {
  it("records every event with nothing skipped", async () => {
    const cluster = await seedCluster()
    const oneTime = await seedEvent("Baptism", "OneTime")
    const recurring = await seedEvent("Sunday Service", "Recurring")
    await link(cluster.id, oneTime.id)
    await link(cluster.id, recurring.id)

    // Both events start closed, which is the state that made the kiosk skip.
    await db.formConfig.create({
      data: {
        scopeKey: `${oneTime.id}:EventCheckIn`,
        key: "EventCheckIn",
        eventId: oneTime.id,
        isOpen: false,
      },
    })

    const member = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Cruz",
        phone: "+63 917 123 4567",
        dateJoined: new Date(),
        language: [],
      },
    })
    for (const eventId of [oneTime.id, recurring.id]) {
      await db.eventRegistrant.create({
        data: { eventId, memberId: member.id, registrationClusterId: cluster.id },
      })
    }

    const opened = await setClusterCheckinOpen(cluster.id, true)
    expect(opened.success).toBe(true)

    const fresh = await db.eventCluster.findUnique({ where: { id: cluster.id } })
    const result = await checkInToCluster(fresh!.publicToken, `member:${member.id}`)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.skipped).toEqual([])
    expect(result.data.recorded.map((r) => r.eventId).sort()).toEqual(
      [oneTime.id, recurring.id].sort()
    )
  })
})
