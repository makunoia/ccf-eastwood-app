/**
 * The event dashboard's setup checklist — specifically the "Set up the
 * registration form" step.
 *
 * That step used to be driven by `EventFormConfig` row existence, on the reasoning
 * that a new event has no rows at all. The nickname migration
 * (`20260804000000_add_form_field_nickname`) writes a Register and a Walk-in row
 * for every event that had none, so row existence stopped meaning anything and the
 * step would tick itself on an event nobody had configured.
 *
 *  - regression: a migration-shaped row must not count as configured
 *  - unit-ish:   any toggle the admin could only have set themselves does count
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getEventSetupChecklist } from "@/lib/events/setup-checklist"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Youth Camp",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
  })
}

async function formStepDone(eventId: string): Promise<boolean> {
  const checklist = await getEventSetupChecklist(eventId, "OneTime")
  return checklist.steps.find((s) => s.key === "form")!.done
}

describe("setup checklist — the registration form step", () => {
  it("is not done for an event with no config at all", async () => {
    const event = await seedEvent()
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is NOT done for the rows the nickname migration writes", async () => {
    // Exactly what the backfill produces: nickname on, everything else default.
    const event = await seedEvent()
    await db.eventFormConfig.createMany({
      data: [
        { eventId: event.id, context: "Register", fieldNickname: true },
        { eventId: event.id, context: "WalkIn", fieldNickname: true },
      ],
    })
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is done once a section the admin chose is on", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", sectionDietary: true },
    })
    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done once a field the admin chose is on", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldGender: true },
    })
    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done when only the success message has been worded", async () => {
    // The other thing the builder edits — configuring copy is still configuring.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        successMessage: "See you at the gym!",
      },
    })
    expect(await formStepDone(event.id)).toBe(true)
  })

  it("counts a real toggle even alongside the backfilled nickname", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        fieldNickname: true,
        sectionSmallGroup: true,
      },
    })
    expect(await formStepDone(event.id)).toBe(true)
  })

  it("ignores another event's configuration", async () => {
    const [mine, theirs] = await Promise.all([seedEvent(), seedEvent()])
    await db.eventFormConfig.create({
      data: { eventId: theirs.id, context: "Register", sectionDietary: true },
    })
    expect(await formStepDone(mine.id)).toBe(false)
  })
})
