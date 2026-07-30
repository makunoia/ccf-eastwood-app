import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { setFormOpen } from "@/app/(dashboard)/forms/actions"
import { getFormConfig } from "@/lib/forms/config"
import { scopeKeyFor } from "@/lib/forms/registry"

/**
 * Check-in's Public access switch — OneTime events only.
 *
 * Check-in used to render no open/closed toggle at all, on the reasoning that
 * sessions own availability via `EventOccurrence.isOpen`. That reasoning only
 * covered MultiDay/Recurring: a OneTime event has no occurrences, so its
 * check-in link was permanently live with no way to close it.
 *
 * OneTime check-in now uses the same `FormConfig.isOpen` gate as every other
 * public form. Session-based events deliberately keep no event-wide switch —
 * their Forms page links to Sessions/Days instead — so nothing reads this flag
 * for them.
 */

async function seedEvent(name: string, type: "OneTime" | "Recurring" = "OneTime") {
  return db.event.create({
    data: {
      name,
      type,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "FormConfig", "EventOccurrence", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("check-in Public access — default", () => {
  it("is open when no FormConfig row exists", async () => {
    // No pre-seeding: every event that existed before this switch keeps working.
    const event = await seedEvent("Sunday Service")
    const cfg = await getFormConfig("EventCheckIn", event.id)
    expect(cfg.isOpen).toBe(true)
  })
})

describe("check-in Public access — toggling", () => {
  it("closes a OneTime event's check-in, which had no other control", async () => {
    const event = await seedEvent("Youth Camp")

    const result = await setFormOpen("EventCheckIn", event.id, false)
    expect(result.success).toBe(true)

    const cfg = await getFormConfig("EventCheckIn", event.id)
    expect(cfg.isOpen).toBe(false)
  })

  it("reopens after being closed", async () => {
    const event = await seedEvent("Youth Camp")
    await setFormOpen("EventCheckIn", event.id, false)
    await setFormOpen("EventCheckIn", event.id, true)

    const cfg = await getFormConfig("EventCheckIn", event.id)
    expect(cfg.isOpen).toBe(true)
  })

  it("writes one row per event rather than duplicating on repeat toggles", async () => {
    const event = await seedEvent("Youth Camp")
    await setFormOpen("EventCheckIn", event.id, false)
    await setFormOpen("EventCheckIn", event.id, true)
    await setFormOpen("EventCheckIn", event.id, false)

    const rows = await db.formConfig.findMany({
      where: { key: "EventCheckIn", eventId: event.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].scopeKey).toBe(scopeKeyFor("EventCheckIn", event.id))
  })
})

describe("check-in Public access — scoping", () => {
  it("does not leak to another event's check-in", async () => {
    const a = await seedEvent("Event A")
    const b = await seedEvent("Event B")

    await setFormOpen("EventCheckIn", a.id, false)

    expect((await getFormConfig("EventCheckIn", a.id)).isOpen).toBe(false)
    expect((await getFormConfig("EventCheckIn", b.id)).isOpen).toBe(true)
  })

  it("does not close the same event's registration form", async () => {
    // Distinct scopeKeys — closing check-in on the day must not stop people
    // from registering, and vice versa.
    const event = await seedEvent("Event A")

    await setFormOpen("EventCheckIn", event.id, false)

    expect((await getFormConfig("EventCheckIn", event.id)).isOpen).toBe(false)
    expect((await getFormConfig("EventRegistration", event.id)).isOpen).toBe(true)
  })
})

describe("check-in Public access — session events are untouched", () => {
  it("leaves EventOccurrence.isOpen as the only control for a Recurring event", async () => {
    // No UI writes FormConfig for these events, and no public page reads it —
    // the session's own flag is what opens and closes check-in.
    const event = await seedEvent("Midweek", "Recurring")
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-08-05"), isOpen: true },
    })

    const stillOpen = await db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    expect(stillOpen?.isOpen).toBe(true)

    // Nothing has written a FormConfig row for it.
    const row = await db.formConfig.findUnique({
      where: { scopeKey: scopeKeyFor("EventCheckIn", event.id) },
    })
    expect(row).toBeNull()
  })

  it("does not close a session when a stale closed row exists", async () => {
    // Guards the convert-after-closing case: an event closed while OneTime and
    // later switched to Recurring must not have its session links dead, since
    // Forms no longer offers a switch to reopen it.
    const event = await seedEvent("Converted", "OneTime")
    await setFormOpen("EventCheckIn", event.id, false)
    await db.event.update({ where: { id: event.id }, data: { type: "Recurring" } })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-08-05"), isOpen: true },
    })

    // The stale row survives, but the occurrence is what the session page reads.
    expect((await getFormConfig("EventCheckIn", event.id)).isOpen).toBe(false)
    const live = await db.eventOccurrence.findUnique({ where: { id: occurrence.id } })
    expect(live?.isOpen).toBe(true)
  })
})

describe("check-in Public access — cluster forms listing", () => {
  it("treats only explicitly closed OneTime rows as closed", async () => {
    // The cluster Check-in Forms card resolves its "Closed" badge with this
    // query. A missing row means open, so it must not appear in the result.
    const closed = await seedEvent("Closed Event")
    const untouched = await seedEvent("Never Configured")
    const reopened = await seedEvent("Reopened Event")

    await setFormOpen("EventCheckIn", closed.id, false)
    await setFormOpen("EventCheckIn", reopened.id, false)
    await setFormOpen("EventCheckIn", reopened.id, true)

    const oneTimeIds = [closed.id, untouched.id, reopened.id]
    const rows = await db.formConfig.findMany({
      where: { key: "EventCheckIn", eventId: { in: oneTimeIds }, isOpen: false },
      select: { eventId: true },
    })

    expect(rows.map((r) => r.eventId)).toEqual([closed.id])
  })

  it("never marks a session-based event closed, since the query skips them", async () => {
    const oneTime = await seedEvent("One Time")
    const recurring = await seedEvent("Recurring", "Recurring")
    await setFormOpen("EventCheckIn", recurring.id, false)

    // The page narrows to OneTime ids before querying, so a stale row on a
    // session event can never produce a "Closed" badge.
    const oneTimeIds = [oneTime.id]
    const rows = await db.formConfig.findMany({
      where: { key: "EventCheckIn", eventId: { in: oneTimeIds }, isOpen: false },
      select: { eventId: true },
    })

    expect(rows).toHaveLength(0)
  })
})
