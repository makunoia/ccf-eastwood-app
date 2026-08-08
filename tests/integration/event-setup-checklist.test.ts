/**
 * The event dashboard's setup checklist — specifically the "Set up the
 * registration form" step.
 *
 * The signal behind that step has been wrong twice, in opposite directions:
 *
 *   1. Row existence, on the reasoning that a new event has no rows at all.
 *      `20260804000000_add_form_field_nickname` writes a Register and a Walk-in
 *      row for every event that had none, so the step ticked itself on events
 *      nobody had configured.
 *   2. "Is any admin-intent toggle on?" Right on the way up, wrong on the way
 *      down: an admin who switched their last toggle off saw the step un-tick
 *      and the checklist re-open at them.
 *
 * It is now `EventFormConfig.configuredAt`, a stamp written only by the save
 * paths in form-config-actions.ts and never by a migration. So the thing these
 * tests are careful about is *who wrote the row*: a direct
 * `db.eventFormConfig.create` stands in for a migration-written row, and
 * anything that should count goes through the real server action.
 *
 *  - regression: a migration-shaped row must not count, whatever it contains
 *  - integration: the save paths stamp; the step is one-and-done afterwards
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { getEventSetupChecklist } from "@/lib/events/setup-checklist"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

const { saveEventFormConfig, saveEventFormSuccessMessage, copyEventFormConfig } = await import(
  "@/app/(dashboard)/events/form-config-actions"
)

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

describe("a row nobody configured does not count", () => {
  it("is not done for an event with no config at all", async () => {
    const event = await seedEvent()
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is NOT done for the rows the nickname migration writes", async () => {
    // Exactly what that backfill produces: nickname on, everything else default.
    const event = await seedEvent()
    await db.eventFormConfig.createMany({
      data: [
        { eventId: event.id, context: "Register", fieldNickname: true },
        { eventId: event.id, context: "WalkIn", fieldNickname: true },
      ],
    })
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is NOT done for a migration-shaped row with real toggles on", async () => {
    // The case the stamp exists for, and the one the toggle-reading version got
    // wrong. A future backfill could switch anything on; what makes a row count
    // is that a save path wrote it, not what it happens to contain.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        fieldNickname: true,
        sectionSmallGroup: true,
      },
    })
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("ignores another event's configuration", async () => {
    const [mine, theirs] = await Promise.all([seedEvent(), seedEvent()])
    await saveEventFormConfig(theirs.id, "Register", { sectionDietary: true })

    expect(await formStepDone(mine.id)).toBe(false)
  })
})

describe("every save path stamps the config", () => {
  it("is done once a section the admin chose is on", async () => {
    const event = await seedEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done once a field the admin chose is on", async () => {
    const event = await seedEvent()
    await saveEventFormConfig(event.id, "Register", { fieldGender: true })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done when only the success message has been worded", async () => {
    // The other thing the builder edits — configuring copy is still configuring.
    const event = await seedEvent()
    await saveEventFormSuccessMessage(event.id, "Register", "See you at the gym!")

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done after copying one context onto another", async () => {
    // Copy is a save too. Listed because it is the path easiest to forget —
    // which is why all four go through one helper rather than four upserts.
    const event = await seedEvent()
    await copyEventFormConfig(event.id, "Register", "WalkIn")

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("counts a save in any context, not just Register", async () => {
    // One step covers all three surfaces, so configuring Check-in satisfies it.
    const event = await seedEvent()
    await saveEventFormConfig(event.id, "CheckIn", { fieldGender: true })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("upgrades a migration-written row the moment an admin saves over it", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({ data: { eventId: event.id, context: "Register" } })
    expect(await formStepDone(event.id)).toBe(false)

    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })

    expect(await formStepDone(event.id)).toBe(true)
  })
})

describe("the step is one-and-done", () => {
  it("stays done after the last toggle is switched back off", async () => {
    // Settled product call: an admin who has been through the builder has
    // configured the form, and "ask for nothing extra" is a choice like any
    // other. Turning everything off must not re-open the checklist at them.
    const event = await seedEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    expect(await formStepDone(event.id)).toBe(true)

    await saveEventFormConfig(event.id, "Register", { sectionDietary: false })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("survives a config saved all the way down to bare", async () => {
    const event = await seedEvent()
    await saveEventFormConfig(event.id, "Register", { ...BARE_EVENT_FORM_CONFIG })

    expect(await formStepDone(event.id)).toBe(true)
  })
})

describe("presentation", () => {
  it("deep-links to the registration form editor", async () => {
    const event = await seedEvent()
    const checklist = await getEventSetupChecklist(event.id, "OneTime")
    const step = checklist.steps.find((s) => s.key === "form")

    expect(step?.href).toBe(`/event/${event.id}/forms/EventRegistration`)
  })

  it("comes before Open registration — configure, then share", async () => {
    const event = await seedEvent()
    const keys = (await getEventSetupChecklist(event.id, "OneTime")).steps.map((s) => s.key)

    expect(keys.indexOf("form")).toBeLessThan(keys.indexOf("register"))
  })
})
