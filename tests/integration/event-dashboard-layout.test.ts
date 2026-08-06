import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"
import {
  resetEventDashboardLayout,
  saveEventDashboardLayout,
  type DashboardLayoutInput,
} from "@/app/(dashboard)/events/dashboard-layout-actions"
import { getEventDashboardLayout } from "@/lib/events/dashboard-widgets-server"
import {
  WIDGET_WIDTHS,
  defaultDashboardLayout,
  visibleLayout,
} from "@/lib/events/dashboard-widgets"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventDashboardWidget", "EventModule", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function makeEvent(
  type: EventType = "Recurring",
  modules: EventModuleType[] = ["Volunteers"]
) {
  return db.event.create({
    data: {
      name: "Midweek Service",
      type,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-01"),
      modules: { create: modules.map((m) => ({ type: m })) },
    },
  })
}

/** A minimal valid payload: three cards filling one row. */
const THREE_CARDS: DashboardLayoutInput = [
  { key: "chartPlacement", visible: true, width: 4 },
  { key: "chartPipeline", visible: true, width: 4 },
  { key: "tableLifeStage", visible: false, width: 4 },
]

describe("saveEventDashboardLayout", () => {
  it("writes one row per entry with sequential order", async () => {
    const event = await makeEvent()

    const result = await saveEventDashboardLayout(event.id, THREE_CARDS)
    expect(result.success).toBe(true)

    const rows = await db.eventDashboardWidget.findMany({
      where: { eventId: event.id },
      orderBy: { order: "asc" },
    })
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.key)).toEqual([
      "chartPlacement",
      "chartPipeline",
      "tableLifeStage",
    ])
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2])
    expect(rows.map((r) => r.visible)).toEqual([true, true, false])
  })

  it("replaces the previous layout instead of leaving orphan rows", async () => {
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, THREE_CARDS)

    const result = await saveEventDashboardLayout(event.id, [
      { key: "chartPipeline", visible: true, width: 12 },
    ])
    expect(result.success).toBe(true)

    const rows = await db.eventDashboardWidget.findMany({ where: { eventId: event.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe("chartPipeline")
    expect(rows[0].width).toBe(12)
  })

  it("round-trips through the resolver in the saved order", async () => {
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, [
      { key: "kpiTurnout", visible: true, width: 4 },
      { key: "kpiAttendance", visible: false, width: 4 },
    ])

    const layout = await getEventDashboardLayout(event.id, "Recurring", ["Volunteers"])
    const keys = layout.kpis.map((w) => w.key)
    expect(keys.indexOf("kpiTurnout")).toBeLessThan(keys.indexOf("kpiAttendance"))
    expect(layout.kpis.find((w) => w.key === "kpiAttendance")?.visible).toBe(false)
    // Widgets with no stored row keep their defaults rather than disappearing.
    expect(layout.kpis.find((w) => w.key === "kpiUniqueAttendees")?.visible).toBe(true)
  })

  it("rejects a duplicated widget", async () => {
    const event = await makeEvent()
    const result = await saveEventDashboardLayout(event.id, [
      { key: "chartPipeline", visible: true, width: 4 },
      { key: "chartPipeline", visible: false, width: 8 },
    ])

    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("rejects an unknown widget key", async () => {
    const event = await makeEvent()
    const result = await saveEventDashboardLayout(event.id, [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { key: "chartSomethingElse" as any, visible: true, width: 4 },
    ])

    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("rejects a width outside the grid", async () => {
    const event = await makeEvent()

    // Narrower than the readable floor, wider than the grid, and fractional.
    for (const width of [2, 13, 0, -4, 6.5]) {
      const result = await saveEventDashboardLayout(event.id, [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { key: "chartPipeline", visible: true, width: width as any },
      ])

      expect(result.success, `width ${width}`).toBe(false)
      expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
    }
  })

  it("accepts every span the registry allows", async () => {
    const event = await makeEvent()

    for (const width of WIDGET_WIDTHS) {
      const result = await saveEventDashboardLayout(event.id, [
        { key: "chartPipeline", visible: true, width },
      ])
      expect(result.success, `width ${width}`).toBe(true)
    }

    const stored = await db.eventDashboardWidget.findFirst({ where: { eventId: event.id } })
    expect(stored?.width).toBe(12)
  })

  it("rejects a widget whose module is off, even though the key is valid", async () => {
    const event = await makeEvent("Recurring", [])
    const result = await saveEventDashboardLayout(event.id, [
      { key: "chartVolunteerStatus", visible: true, width: 4 },
    ])

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain("Volunteer Status")
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("rejects a widget that doesn't apply to the event type", async () => {
    const event = await makeEvent("OneTime", ["Volunteers"])
    const result = await saveEventDashboardLayout(event.id, [
      { key: "chartSeriesComparison", visible: true, width: 12 },
    ])

    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("fails cleanly for an event that doesn't exist", async () => {
    const result = await saveEventDashboardLayout("no-such-event", THREE_CARDS)
    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toBe("Event not found.")
  })
})

describe("resetEventDashboardLayout", () => {
  it("deletes every row so the event resolves back to the defaults", async () => {
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, [
      { key: "chartPipeline", visible: false, width: 12 },
    ])
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(1)

    const result = await resetEventDashboardLayout(event.id)
    expect(result.success).toBe(true)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)

    const layout = await getEventDashboardLayout(event.id, "Recurring", ["Volunteers"])
    expect(layout).toEqual(defaultDashboardLayout("Recurring", ["Volunteers"]))
  })

  it("is a no-op on an event that was never customized", async () => {
    const event = await makeEvent()
    const result = await resetEventDashboardLayout(event.id)
    expect(result.success).toBe(true)
  })
})

describe("getEventDashboardLayout", () => {
  it("returns the defaults for an event with no stored rows", async () => {
    const event = await makeEvent("OneTime", ["Volunteers", "Priced"])
    const layout = await getEventDashboardLayout(event.id, "OneTime", ["Volunteers", "Priced"])

    expect(layout).toEqual(defaultDashboardLayout("OneTime", ["Volunteers", "Priced"]))
    expect(visibleLayout(layout).cards.map((c) => c.key)).not.toContain("chartAttendanceSeries")
  })

  it("deleting the event cascades its stored layout away", async () => {
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, THREE_CARDS)

    await db.event.delete({ where: { id: event.id } })
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })
})

describe("permissions", () => {
  it("refuses to save without Events write permission", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "staff", role: "Staff", permissions: [], eventAccess: [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const result = await saveEventDashboardLayout(event.id, THREE_CARDS)
    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("refuses to save when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)

    const result = await saveEventDashboardLayout(event.id, THREE_CARDS)
    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("refuses to reset when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, THREE_CARDS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)

    const result = await resetEventDashboardLayout(event.id)
    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(3)
  })

  /**
   * A Staff user scoped to a subset of events. The Events feature flag alone is
   * not enough — the action carries its own event id, so it has to be checked
   * against `eventAccess` and not just against the permission.
   */
  function scopedStaff(eventAccess: string[]) {
    return {
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Write"] }],
        eventAccess,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it("refuses to save for an event outside the user's event access", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    vi.mocked(auth).mockResolvedValueOnce(scopedStaff(["some-other-event"]))

    const result = await saveEventDashboardLayout(event.id, THREE_CARDS)
    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("refuses to reset for an event outside the user's event access", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    await saveEventDashboardLayout(event.id, THREE_CARDS)
    vi.mocked(auth).mockResolvedValueOnce(scopedStaff(["some-other-event"]))

    const result = await resetEventDashboardLayout(event.id)
    expect(result.success).toBe(false)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(3)
  })

  it("allows a scoped staff user to save their own event", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    vi.mocked(auth).mockResolvedValueOnce(scopedStaff([event.id]))

    const result = await saveEventDashboardLayout(event.id, THREE_CARDS)
    expect(result.success).toBe(true)
    expect(await db.eventDashboardWidget.count({ where: { eventId: event.id } })).toBe(3)
  })
})
