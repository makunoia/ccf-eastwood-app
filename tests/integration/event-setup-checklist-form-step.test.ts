import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getEventSetupChecklist, type SetupStepKey } from "@/lib/events/setup-checklist"

/**
 * The "Set up the registration form" step on the event dashboard checklist.
 *
 * Promoted out of the gitignored `tests/tickets/` so it runs in CI, and rewritten
 * against the current contract. The originals asserted that *a row exists* marks
 * the step done. That was true when they were written and is deliberately no
 * longer: `20260804000000_add_form_field_nickname` writes a row for every event
 * that had none, so row-existence would tick this step for an event nobody has
 * touched. `lib/events/setup-checklist.ts` now asks whether any
 * ADMIN_INTENT_TOGGLE_KEYS toggle is on, or a success message has been worded —
 * both things only an admin can have done.
 *
 * The step is therefore no longer monotonic; the last test here pins that, and
 * it is a real behaviour change rather than a settled decision. See the note in
 * the suite.
 */

function checklistFor(eventId: string) {
  return getEventSetupChecklist(eventId, "OneTime", [])
}

function stepDone(
  checklist: Awaited<ReturnType<typeof getEventSetupChecklist>>,
  key: SetupStepKey
) {
  return checklist.steps.find((s) => s.key === key)?.done
}

async function formStepDone(eventId: string) {
  return stepDone(await checklistFor(eventId), "form")
}

async function seedEvent() {
  return db.event.create({
    data: { name: "Setup", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("the form step reads admin intent, not row existence", () => {
  it("is undone for an event with no config at all", async () => {
    const event = await seedEvent()
    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is undone for a bare row — the row alone proves nothing", async () => {
    // This is the case the old suite got backwards. A migration can create this
    // row; an admin visiting the builder and changing nothing leaves the same
    // thing behind. Neither is "the form is set up".
    const event = await seedEvent()
    await db.eventFormConfig.create({ data: { eventId: event.id, context: "Register" } })

    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is undone when only the migration-written nickname is on", async () => {
    // fieldNickname is backfilled true for every pre-existing event, so counting
    // it would tick the step for the entire back catalogue on deploy.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldNickname: true },
    })

    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is undone when only the identity fields are on", async () => {
    // Mobile and email default true (CCF-142's "bare means identity-only"), so
    // they arrive on without anyone choosing them.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldMobile: true, fieldEmail: true },
    })

    expect(await formStepDone(event.id)).toBe(false)
  })

  it("is done once a real toggle is on", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", sectionDietary: true },
    })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("is done on a worded success message, with no toggle at all", async () => {
    // The other thing the builder edits — configuring the copy is configuring
    // the form.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", successMessage: "See you there!" },
    })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("counts intent in any context, not just Register", async () => {
    // One step covers all three surfaces, so configuring Check-in satisfies it.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "CheckIn", fieldGender: true },
    })

    expect(await formStepDone(event.id)).toBe(true)
  })

  it("deep-links to the registration form editor", async () => {
    const event = await seedEvent()
    const step = (await checklistFor(event.id)).steps.find((s) => s.key === "form")

    expect(step?.href).toBe(`/event/${event.id}/forms/EventRegistration`)
  })

  it("comes before Open registration — configure, then share", async () => {
    const event = await seedEvent()
    const keys = (await checklistFor(event.id)).steps.map((s) => s.key)

    expect(keys.indexOf("form")).toBeLessThan(keys.indexOf("register"))
  })
})

describe("the step is no longer monotonic", () => {
  it("goes back to undone when the last real toggle is switched off", async () => {
    // Pinned as observed behaviour, NOT as a settled decision. The previous
    // contract was deliberately one-way ("there is no path that un-configures a
    // form"); moving from row-existence to intent-toggles dropped that without
    // anyone choosing to. Whether an admin who turns everything off should see
    // the checklist re-open is a product call — if the answer is no, this test
    // is the one to change, and `configuredFormCount` needs a separate
    // "has been visited" signal.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", sectionDietary: true },
    })
    expect(await formStepDone(event.id)).toBe(true)

    await db.eventFormConfig.update({
      where: { eventId_context: { eventId: event.id, context: "Register" } },
      data: { sectionDietary: false },
    })

    expect(await formStepDone(event.id)).toBe(false)
  })
})
