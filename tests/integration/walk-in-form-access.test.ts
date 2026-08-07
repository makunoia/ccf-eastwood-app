import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { setFormOpen } from "@/app/(dashboard)/forms/actions"
import { setWalkInOccurrence } from "@/app/(dashboard)/events/form-config-actions"
import { getFormConfig } from "@/lib/forms/config"
import { checkInWalkInRegistrant } from "@/lib/events/registration-core"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Walk-in's own open/close rules (CCF-133).
 *
 * Walk-in used to be the registration page plus `?checkin=`, exempt from every
 * gate: it ignored the registration form's switch and the Opens/Closes window,
 * and it took its session from the URL. It now has a switch of its own and a
 * session an admin names, and the two are independent of pre-registration in
 * both directions.
 *
 * These pin the rules the public page reads. The page itself is a server
 * component, so what's asserted here is the state it resolves from.
 */

async function seedEvent(
  name: string,
  type: "OneTime" | "MultiDay" | "Recurring" = "Recurring"
) {
  return db.event.create({
    data: {
      name,
      type,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
}

async function seedOccurrence(eventId: string, date: string, isOpen: boolean) {
  return db.eventOccurrence.create({
    data: { eventId, date: new Date(date), isOpen },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "FormConfig", "EventFormConfig", "EventOccurrence", "EventCluster", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("walk-in Public access", () => {
  it("is closed when no FormConfig row exists", async () => {
    // The deliberate behavior change in PR 2. A public URL that registers *and*
    // records attendance is a live attendance surface, so a new event starts with
    // the door shut and staff open it for the day.
    const event = await seedEvent("Sunday Service")
    const cfg = await getFormConfig("EventWalkIn", event.id)
    expect(cfg.isOpen).toBe(false)
  })

  it("leaves every other form open by default", async () => {
    // The default is per-form, not a blanket flip — registration and check-in
    // must keep working on an event nobody has configured.
    const event = await seedEvent("Sunday Service")
    expect((await getFormConfig("EventRegistration", event.id)).isOpen).toBe(true)
    expect((await getFormConfig("EventCheckIn", event.id)).isOpen).toBe(true)
  })

  it("is independent of the registration form's switch", async () => {
    const event = await seedEvent("Sunday Service")
    await setFormOpen("EventWalkIn", event.id, true)

    // Close pre-registration the night before — the door must stay open.
    await setFormOpen("EventRegistration", event.id, false)
    expect((await getFormConfig("EventWalkIn", event.id)).isOpen).toBe(true)
    expect((await getFormConfig("EventRegistration", event.id)).isOpen).toBe(false)

    // And the reverse: closing the door leaves pre-registration alone.
    await setFormOpen("EventRegistration", event.id, true)
    await setFormOpen("EventWalkIn", event.id, false)
    expect((await getFormConfig("EventWalkIn", event.id)).isOpen).toBe(false)
    expect((await getFormConfig("EventRegistration", event.id)).isOpen).toBe(true)
  })

  it("writes to its own config row", async () => {
    const event = await seedEvent("Sunday Service")
    await setFormOpen("EventWalkIn", event.id, false)
    const rows = await db.formConfig.findMany({ where: { eventId: event.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe("EventWalkIn")
  })
})

describe("walk-in session", () => {
  it("starts unset, which closes the door", async () => {
    const event = await seedEvent("Sunday Service")
    expect(event.walkInOccurrenceId).toBeNull()
  })

  it("points the door at a session the admin names", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true)

    const result = await setWalkInOccurrence(event.id, occurrence.id)
    expect(result.success).toBe(true)

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { walkInOccurrenceId: true },
    })
    expect(updated?.walkInOccurrenceId).toBe(occurrence.id)
  })

  it("refuses another event's session", async () => {
    // The FK alone would accept this and quietly cross-post attendance to an
    // event the door has nothing to do with.
    const event = await seedEvent("Sunday Service")
    const other = await seedEvent("Youth Night")
    const foreign = await seedOccurrence(other.id, "2026-08-09", true)

    const result = await setWalkInOccurrence(event.id, foreign.id)
    expect(result.success).toBe(false)

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { walkInOccurrenceId: true },
    })
    expect(updated?.walkInOccurrenceId).toBeNull()
  })

  it("refuses a session on a OneTime event", async () => {
    const event = await seedEvent("Christmas Party", "OneTime")
    const other = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(other.id, "2026-08-09", true)

    const result = await setWalkInOccurrence(event.id, occurrence.id)
    expect(result.success).toBe(false)
  })

  it("clears back to null", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true)
    await setWalkInOccurrence(event.id, occurrence.id)

    const result = await setWalkInOccurrence(event.id, null)
    expect(result.success).toBe(true)

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { walkInOccurrenceId: true },
    })
    expect(updated?.walkInOccurrenceId).toBeNull()
  })

  it("clears itself when the chosen session is deleted", async () => {
    // ON DELETE SET NULL: deleting the session closes walk-in rather than
    // leaving it aimed at a row that no longer exists.
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true)
    await setWalkInOccurrence(event.id, occurrence.id)

    await db.eventOccurrence.delete({ where: { id: occurrence.id } })

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { walkInOccurrenceId: true },
    })
    expect(updated?.walkInOccurrenceId).toBeNull()
  })

  it("keeps a closed session selected so the reason is visible", async () => {
    // Closing a session must not silently clear the pointer — the admin needs to
    // see which session is closed, not an empty dropdown.
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true)
    await setWalkInOccurrence(event.id, occurrence.id)

    await db.eventOccurrence.update({
      where: { id: occurrence.id },
      data: { isOpen: false },
    })

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { walkInOccurrence: { select: { id: true, isOpen: true } } },
    })
    expect(updated?.walkInOccurrence?.id).toBe(occurrence.id)
    expect(updated?.walkInOccurrence?.isOpen).toBe(false)
  })
})

describe("cluster walk-in switch", () => {
  async function seedCluster(name: string) {
    return db.eventCluster.create({ data: { name, date: new Date("2026-08-09") } })
  }

  it("starts closed", async () => {
    const cluster = await seedCluster("Sunday Day")
    expect(cluster.walkInIsOpen).toBe(false)
  })

  it("opens and closes independently of the shared form", async () => {
    const cluster = await seedCluster("Sunday Day")

    await updateEventCluster(cluster.id, { walkInIsOpen: true, isOpen: false })
    let row = await db.eventCluster.findUnique({
      where: { id: cluster.id },
      select: { isOpen: true, walkInIsOpen: true },
    })
    // Shared form closed the night before, door still running.
    expect(row).toEqual({ isOpen: false, walkInIsOpen: true })

    await updateEventCluster(cluster.id, { walkInIsOpen: false, isOpen: true })
    row = await db.eventCluster.findUnique({
      where: { id: cluster.id },
      select: { isOpen: true, walkInIsOpen: true },
    })
    expect(row).toEqual({ isOpen: true, walkInIsOpen: false })
  })

  it("leaves the door alone when only the shared form is toggled", async () => {
    // The two switches share one action; an omitted field must not overwrite.
    const cluster = await seedCluster("Sunday Day")
    await updateEventCluster(cluster.id, { walkInIsOpen: true })

    await updateEventCluster(cluster.id, { isOpen: true })

    const row = await db.eventCluster.findUnique({
      where: { id: cluster.id },
      select: { walkInIsOpen: true },
    })
    expect(row?.walkInIsOpen).toBe(true)
  })
})

describe("walk-in attendance", () => {
  it("records attendance against the configured session", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true)
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Juan", lastName: "dela Cruz" },
    })

    await checkInWalkInRegistrant(registrant.id, occurrence.id)

    const attendance = await db.occurrenceAttendee.findMany({
      where: { registrantId: registrant.id },
    })
    expect(attendance).toHaveLength(1)
    expect(attendance[0].occurrenceId).toBe(occurrence.id)
  })

  it("stamps attendedAt on a OneTime event, which has no session", async () => {
    const event = await seedEvent("Christmas Party", "OneTime")
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Juan", lastName: "dela Cruz" },
    })

    await checkInWalkInRegistrant(registrant.id, null)

    const updated = await db.eventRegistrant.findUnique({
      where: { id: registrant.id },
      select: { attendedAt: true },
    })
    expect(updated?.attendedAt).not.toBeNull()
  })
})
