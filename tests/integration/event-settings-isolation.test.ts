import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { updateEvent, updateRegistrationWindow } from "@/app/(dashboard)/events/actions"
import { setPricedModule } from "@/app/(dashboard)/events/module-actions"
import type { EventFormValues } from "@/lib/validations/event"

/**
 * Regression: saving Event Settings → Details must not disturb the price or the
 * registration window.
 *
 * Both used to be fields on the same form, written unconditionally by
 * `updateEvent`. Once their inputs moved to the Modules tab and the Forms screen,
 * a Details save would have silently nulled whatever those screens had set — the
 * exact failure this pins.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventModule", "EventMinistry", "Ministry", "Event" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

const details: EventFormValues = {
  name: "Renamed Event",
  description: "Edited on the Details tab",
  ministryIds: [],
  allMinistries: false,
  type: "OneTime",
  startDate: "2026-09-01",
  endDate: "",
  recurrenceDayOfWeek: "",
  recurrenceFrequency: "",
  recurrenceEndDate: "",
}

async function makeEvent() {
  const event = await db.event.create({
    data: {
      name: "Original Event",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
    select: { id: true },
  })
  return event.id
}

describe("Details save leaves other screens' settings alone", () => {
  it("preserves the price set by the Priced module", async () => {
    const eventId = await makeEvent()
    await setPricedModule(eventId, "2500")

    const result = await updateEvent(eventId, details)

    expect(result.success).toBe(true)
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { name: true, price: true },
    })
    expect(event?.name).toBe("Renamed Event")
    expect(event?.price).toBe(250000)
  })

  it("preserves the registration window set on the Forms screen", async () => {
    const eventId = await makeEvent()
    await updateRegistrationWindow(eventId, {
      registrationStart: "2026-07-01",
      registrationEnd: "2026-08-15",
    })

    const result = await updateEvent(eventId, details)

    expect(result.success).toBe(true)
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { registrationStart: true, registrationEnd: true },
    })
    expect(event?.registrationStart).not.toBeNull()
    expect(event?.registrationEnd).not.toBeNull()
  })

  it("preserves the Priced module row itself", async () => {
    const eventId = await makeEvent()
    await setPricedModule(eventId, "999")

    await updateEvent(eventId, details)

    expect(
      await db.eventModule.count({ where: { eventId, type: "Priced" } })
    ).toBe(1)
  })
})

describe("updateRegistrationWindow", () => {
  it("round-trips both bounds", async () => {
    const eventId = await makeEvent()

    const result = await updateRegistrationWindow(eventId, {
      registrationStart: "2026-07-01",
      registrationEnd: "2026-08-15",
    })

    expect(result.success).toBe(true)
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { registrationStart: true, registrationEnd: true },
    })
    expect(event?.registrationStart?.toISOString()).toContain("2026-07-01")
    expect(event?.registrationEnd?.toISOString()).toContain("2026-08-15")
  })

  it("treats a blank bound as unbounded", async () => {
    const eventId = await makeEvent()
    await updateRegistrationWindow(eventId, {
      registrationStart: "2026-07-01",
      registrationEnd: "2026-08-15",
    })

    await updateRegistrationWindow(eventId, {
      registrationStart: "",
      registrationEnd: "",
    })

    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { registrationStart: true, registrationEnd: true },
    })
    expect(event?.registrationStart).toBeNull()
    expect(event?.registrationEnd).toBeNull()
  })

  it("rejects a window that closes before it opens", async () => {
    const eventId = await makeEvent()

    const result = await updateRegistrationWindow(eventId, {
      registrationStart: "2026-08-15",
      registrationEnd: "2026-07-01",
    })

    expect(result.success).toBe(false)
  })

  it("refuses a window on a Recurring event", async () => {
    const event = await db.event.create({
      data: {
        name: "Weekly",
        type: "Recurring",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-01"),
      },
      select: { id: true },
    })

    const result = await updateRegistrationWindow(event.id, {
      registrationStart: "2026-07-01",
      registrationEnd: "",
    })

    expect(result.success).toBe(false)
  })
})

describe("All Ministries flag", () => {
  it("links no ministry rows when the event is church-wide", async () => {
    const eventId = await makeEvent()
    const ministry = await db.ministry.create({
      data: { name: "Young Pro" },
      select: { id: true },
    })

    const result = await updateEvent(eventId, {
      ...details,
      allMinistries: true,
      // Any stale picks are dropped — the flag is the statement.
      ministryIds: [ministry.id],
    })

    expect(result.success).toBe(true)
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { allMinistries: true, ministries: { select: { ministryId: true } } },
    })
    expect(event?.allMinistries).toBe(true)
    expect(event?.ministries).toEqual([])
  })

  it("keeps explicit ministry links distinct from the flag", async () => {
    const eventId = await makeEvent()
    const ministry = await db.ministry.create({
      data: { name: "Couples" },
      select: { id: true },
    })

    await updateEvent(eventId, { ...details, ministryIds: [ministry.id] })

    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { allMinistries: true, ministries: { select: { ministryId: true } } },
    })
    expect(event?.allMinistries).toBe(false)
    expect(event?.ministries).toEqual([{ ministryId: ministry.id }])
  })

  it("clears the links when switching an event to church-wide", async () => {
    const eventId = await makeEvent()
    const ministry = await db.ministry.create({
      data: { name: "Youth" },
      select: { id: true },
    })
    await updateEvent(eventId, { ...details, ministryIds: [ministry.id] })

    await updateEvent(eventId, { ...details, allMinistries: true, ministryIds: [] })

    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { allMinistries: true, ministries: { select: { ministryId: true } } },
    })
    expect(event?.allMinistries).toBe(true)
    expect(event?.ministries).toEqual([])
  })
})
