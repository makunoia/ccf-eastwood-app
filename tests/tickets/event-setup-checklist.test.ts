import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  getEventSetupChecklist,
  isSetupStepKey,
  SETUP_STEP_KEYS,
  type SetupStepKey,
} from "@/lib/events/setup-checklist"
import {
  dismissEventSetup,
  setEventSetupStepSkipped,
} from "@/app/(dashboard)/events/actions"
import { saveEventFormConfig } from "@/app/(dashboard)/events/form-config-actions"
import type { EventModuleType } from "@/app/generated/prisma/client"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

/**
 * Event setup walkthrough — the dashboard "Set up your event" checklist.
 *
 * Covers per-step completion detection, event-type adaptation (OneTime omits the
 * Sessions step and checks in via attendedAt), and the dismiss persistence flag.
 */

/**
 * Most of these cases exercise the volunteer and breakout steps, which only exist
 * when their modules are on (CCF-128/CCF-131). Default to both enabled so each test
 * states the record it seeds, not the module plumbing behind it.
 */
const BOTH_MODULES = ["Volunteers", "Breakout"] as const

function checklistFor(
  eventId: string,
  type: "OneTime" | "MultiDay" | "Recurring",
  modules: readonly EventModuleType[] = BOTH_MODULES,
) {
  return getEventSetupChecklist(eventId, type, [...modules])
}

function stepDone(
  checklist: Awaited<ReturnType<typeof getEventSetupChecklist>>,
  key: SetupStepKey,
) {
  return checklist.steps.find((s) => s.key === key)?.done
}

async function seedEvent(type: "OneTime" | "MultiDay" | "Recurring") {
  return db.event.create({
    data: { name: `Setup ${type}`, type, startDate: new Date(), endDate: new Date() },
  })
}

async function seedConfirmedVolunteer(eventId: string) {
  const member = await db.member.create({
    data: { firstName: "Vol", lastName: "Unteer", dateJoined: new Date(), language: [] },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  return db.volunteer.create({
    data: {
      memberId: member.id,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
}

describe("event setup checklist", () => {
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE "Event", "Member", "Guest", "VolunteerCommittee", "CommitteeRole", "Volunteer", "BreakoutGroup", "EventOccurrence", "EventRegistrant", "OccurrenceAttendee", "EventFormConfig" RESTART IDENTITY CASCADE`
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it("marks every step not-done for an empty event", async () => {
    const event = await seedEvent("Recurring")
    // An event that took no modules at creation is left with the steps every event
    // has, plus Sessions for a non-OneTime type.
    const checklist = await getEventSetupChecklist(event.id, "Recurring", [])

    expect(checklist.totalCount).toBe(4)
    expect(checklist.completedCount).toBe(0)
    expect(checklist.allComplete).toBe(false)
    expect(checklist.steps.every((s) => !s.done)).toBe(true)
  })

  it("flips only the committees step when a committee exists", async () => {
    const event = await seedEvent("Recurring")
    await db.volunteerCommittee.create({ data: { name: "Logistics", eventId: event.id } })

    const checklist = await checklistFor(event.id, "Recurring")
    expect(stepDone(checklist, "committees")).toBe(true)
    expect(checklist.completedCount).toBe(1)
    expect(stepDone(checklist, "volunteers")).toBe(false)
  })

  it("flips the volunteers and breakouts steps when those records exist", async () => {
    const event = await seedEvent("Recurring")
    const volunteer = await seedConfirmedVolunteer(event.id)
    await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })

    const checklist = await checklistFor(event.id, "Recurring")
    expect(stepDone(checklist, "committees")).toBe(true) // seeded via volunteer
    expect(stepDone(checklist, "volunteers")).toBe(true)
    expect(stepDone(checklist, "breakouts")).toBe(true)
  })

  it("flips the register step when a registrant exists", async () => {
    const event = await seedEvent("Recurring")
    const guest = await db.guest.create({
      data: { firstName: "Reg", lastName: "Istrant", language: [] },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const checklist = await checklistFor(event.id, "Recurring")
    expect(stepDone(checklist, "register")).toBe(true)
  })

  describe("event-type adaptation", () => {
    it("omits the Sessions step for OneTime (totalCount 6)", async () => {
      const event = await seedEvent("OneTime")
      const checklist = await checklistFor(event.id, "OneTime")

      expect(checklist.totalCount).toBe(6)
      expect(checklist.steps.some((s) => s.key === "sessions")).toBe(false)
    })

    it("includes the Sessions step for MultiDay/Recurring (totalCount 7)", async () => {
      const event = await seedEvent("MultiDay")
      const checklist = await checklistFor(event.id, "MultiDay")

      expect(checklist.totalCount).toBe(7)
      expect(checklist.steps.some((s) => s.key === "sessions")).toBe(true)
    })

    it("flips Sessions when an occurrence exists (non-OneTime)", async () => {
      const event = await seedEvent("MultiDay")
      await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date() } })

      const checklist = await checklistFor(event.id, "MultiDay")
      expect(stepDone(checklist, "sessions")).toBe(true)
    })
  })

  describe("check-in signal per type", () => {
    it("OneTime check-in is detected via EventRegistrant.attendedAt", async () => {
      const event = await seedEvent("OneTime")
      const guest = await db.guest.create({
        data: { firstName: "A", lastName: "B", language: [] },
      })
      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
      })

      const checklist = await checklistFor(event.id, "OneTime")
      expect(stepDone(checklist, "checkin")).toBe(true)
    })

    it("OneTime check-in stays not-done when nobody has attendedAt", async () => {
      const event = await seedEvent("OneTime")
      const guest = await db.guest.create({
        data: { firstName: "A", lastName: "B", language: [] },
      })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const checklist = await checklistFor(event.id, "OneTime")
      expect(stepDone(checklist, "register")).toBe(true)
      expect(stepDone(checklist, "checkin")).toBe(false)
    })

    it("session check-in only counts participant rows, not volunteer-only check-ins", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date() },
      })
      const volunteer = await seedConfirmedVolunteer(event.id)

      // A volunteer-only check-in (registrantId null) must NOT mark check-in done.
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, volunteerId: volunteer.id },
      })
      expect(stepDone(await checklistFor(event.id, "Recurring"), "checkin")).toBe(false)

      // A participant check-in does.
      const guest = await db.guest.create({
        data: { firstName: "P", lastName: "Q", language: [] },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })
      expect(stepDone(await checklistFor(event.id, "Recurring"), "checkin")).toBe(true)
    })
  })

  it("reports allComplete once every applicable step is satisfied (OneTime)", async () => {
    const event = await seedEvent("OneTime")
    const volunteer = await seedConfirmedVolunteer(event.id) // committees + volunteers
    await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const guest = await db.guest.create({
      data: { firstName: "Reg", lastName: "Istrant", language: [] },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() }, // register + checkin
    })
    // Through the action so `configuredAt` is stamped — a raw insert reads as a
    // migration-written row and no longer satisfies the step.
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true }) // form

    const checklist = await checklistFor(event.id, "OneTime")
    expect(checklist.allComplete).toBe(true)
    expect(checklist.completedCount).toBe(checklist.totalCount)
  })

  // CCF-121 — registration-form setup surfaced as a checklist step.
  describe("registration form step", () => {
    it("is not done for a brand-new event (no config rows — the form is bare)", async () => {
      const event = await seedEvent("OneTime")
      const checklist = await checklistFor(event.id, "OneTime")

      expect(checklist.steps.some((s) => s.key === "form")).toBe(true)
      expect(stepDone(checklist, "form")).toBe(false)
    })

    it("flips once any context has been configured", async () => {
      // Through the action, not a direct insert: the step now reads
      // `configuredAt`, which only the save paths write. A raw insert is what a
      // migration looks like. See tests/integration/event-setup-checklist.test.ts.
      const event = await seedEvent("OneTime")
      await saveEventFormConfig(event.id, "CheckIn", { fieldGender: true })

      expect(stepDone(await checklistFor(event.id, "OneTime"), "form")).toBe(true)
    })

    it("does NOT count a bare row — a migration could have written it", async () => {
      // Contract reversed deliberately: the nickname migration writes a row for
      // every event that had none, so row-existence would tick this step for the
      // whole back catalogue. The step now reads ADMIN_INTENT_TOGGLE_KEYS.
      // Committed version: tests/integration/event-setup-checklist-form-step.test.ts
      const event = await seedEvent("OneTime")
      await db.eventFormConfig.create({ data: { eventId: event.id, context: "Register" } })

      expect(stepDone(await checklistFor(event.id, "OneTime"), "form")).toBe(false)
    })

    it("deep-links to the registration form editor", async () => {
      const event = await seedEvent("OneTime")
      const checklist = await checklistFor(event.id, "OneTime")
      const step = checklist.steps.find((s) => s.key === "form")

      expect(step?.href).toBe(`/event/${event.id}/forms/EventRegistration`)
    })

    it("is ordered before Open registration — configure, then share", async () => {
      const event = await seedEvent("OneTime")
      const keys = (await checklistFor(event.id, "OneTime")).steps.map((s) => s.key)

      expect(keys.indexOf("form")).toBeLessThan(keys.indexOf("register"))
    })

    it("appears for every event type", async () => {
      for (const type of ["OneTime", "MultiDay", "Recurring"] as const) {
        const event = await seedEvent(type)
        const checklist = await checklistFor(event.id, type)
        expect(checklist.steps.some((s) => s.key === "form"), type).toBe(true)
      }
    })

    it("reads as already done for an event migrated from the legacy toggles", async () => {
      // Cross-ticket interaction worth pinning: CCF-119's backfill writes three
      // rows for every pre-existing event, so a migrated event's form step is
      // done from the start. That is intended — their form IS already configured,
      // and asking them to re-visit a builder to satisfy a checkbox would be noise.
      const event = await seedEvent("OneTime")
      await db.eventFormConfig.createMany({
        data: (["Register", "WalkIn", "CheckIn"] as const).map((context) => ({
          eventId: event.id,
          context,
        })),
      })

      expect(stepDone(await checklistFor(event.id, "OneTime"), "form")).toBe(false)
    })

    it("stays done once configured — there is no path that un-configures a form", async () => {
      // Monotonic on purpose, and now enforced by a stamp rather than inferred:
      // `configuredAt` records that an admin was here, so turning every toggle
      // back off leaves the step satisfied. Briefly regressed when the step read
      // the toggles instead; settled as one-and-done.
      const event = await seedEvent("OneTime")
      await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
      expect(stepDone(await checklistFor(event.id, "OneTime"), "form")).toBe(true)

      await saveEventFormConfig(event.id, "Register", { sectionDietary: false })
      expect(stepDone(await checklistFor(event.id, "OneTime"), "form")).toBe(true)
    })
  })

  // Per-step skip — opting out of one step without dismissing the whole card.
  describe("skipping a step", () => {
    async function checklistWithSkips(
      eventId: string,
      type: "OneTime" | "MultiDay" | "Recurring" = "OneTime",
      modules: readonly EventModuleType[] = BOTH_MODULES,
    ) {
      const event = await db.event.findUniqueOrThrow({ where: { id: eventId } })
      return getEventSetupChecklist(eventId, type, [...modules], event.setupSkippedSteps)
    }

    function step(
      checklist: Awaited<ReturnType<typeof getEventSetupChecklist>>,
      key: SetupStepKey,
    ) {
      return checklist.steps.find((s) => s.key === key)
    }

    it("defaults to an empty list on a fresh event — no step starts skipped", async () => {
      const event = await seedEvent("OneTime")
      expect(event.setupSkippedSteps).toEqual([])

      const checklist = await checklistWithSkips(event.id)
      expect(checklist.steps.every((s) => !s.skipped)).toBe(true)
      expect(checklist.skippedCount).toBe(0)
    })

    it("marks the step skipped and counts it out of the outstanding work", async () => {
      const event = await seedEvent("OneTime")
      const result = await setEventSetupStepSkipped(event.id, "breakouts", true)
      expect(result.success).toBe(true)

      const checklist = await checklistWithSkips(event.id)
      expect(step(checklist, "breakouts")?.skipped).toBe(true)
      expect(step(checklist, "breakouts")?.done).toBe(false)
      expect(checklist.skippedCount).toBe(1)
      // Skipping never fakes progress — only `skippedCount` moves.
      expect(checklist.completedCount).toBe(0)
      // Nor does it shrink the list: the step stays visible so it can be restored.
      expect(checklist.totalCount).toBe(6)
    })

    it("restores a skipped step", async () => {
      const event = await seedEvent("OneTime")
      await setEventSetupStepSkipped(event.id, "breakouts", true)
      await setEventSetupStepSkipped(event.id, "breakouts", false)

      const checklist = await checklistWithSkips(event.id)
      expect(step(checklist, "breakouts")?.skipped).toBe(false)
      expect(checklist.skippedCount).toBe(0)
    })

    it("is idempotent — skipping twice stores one key", async () => {
      const event = await seedEvent("OneTime")
      await setEventSetupStepSkipped(event.id, "breakouts", true)
      await setEventSetupStepSkipped(event.id, "breakouts", true)

      const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } })
      expect(updated.setupSkippedSteps).toEqual(["breakouts"])
    })

    it("un-skipping a step that was never skipped is a no-op, not an error", async () => {
      const event = await seedEvent("OneTime")
      const result = await setEventSetupStepSkipped(event.id, "checkin", false)

      expect(result.success).toBe(true)
      const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } })
      expect(updated.setupSkippedSteps).toEqual([])
    })

    it("rejects an unknown step key instead of storing junk", async () => {
      const event = await seedEvent("OneTime")
      const result = await setEventSetupStepSkipped(event.id, "not-a-step", true)

      expect(result.success).toBe(false)
      const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } })
      expect(updated.setupSkippedSteps).toEqual([])
    })

    it("rejects a missing event", async () => {
      const result = await setEventSetupStepSkipped("nope", "checkin", true)
      expect(result.success).toBe(false)
    })

    it("reports allComplete when every remaining step is skipped", async () => {
      const event = await seedEvent("OneTime")
      const checklist = await checklistWithSkips(event.id)
      for (const s of checklist.steps) {
        await setEventSetupStepSkipped(event.id, s.key, true)
      }

      const after = await checklistWithSkips(event.id)
      expect(after.allComplete).toBe(true)
      // Honest counts behind the "nothing left" state: nothing was actually done.
      expect(after.completedCount).toBe(0)
      expect(after.skippedCount).toBe(after.totalCount)
    })

    it("a skipped step that gets done anyway reads as done, not skipped", async () => {
      const event = await seedEvent("OneTime")
      await setEventSetupStepSkipped(event.id, "breakouts", true)
      const volunteer = await seedConfirmedVolunteer(event.id)
      await db.breakoutGroup.create({
        data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
      })

      const checklist = await checklistWithSkips(event.id)
      expect(step(checklist, "breakouts")?.done).toBe(true)
      expect(checklist.completedCount).toBeGreaterThan(0)
      // Done wins: the step stops counting as an opt-out.
      expect(checklist.skippedCount).toBe(0)
    })

    it("a key for a step this event doesn't show is inert", async () => {
      // Modules can be turned off after a step was skipped. The stale key stays in
      // the column rather than being pruned — it simply matches nothing.
      const event = await seedEvent("OneTime")
      await setEventSetupStepSkipped(event.id, "breakouts", true)

      const checklist = await checklistWithSkips(event.id, "OneTime", [])
      expect(checklist.steps.some((s) => s.key === "breakouts")).toBe(false)
      expect(checklist.skippedCount).toBe(0)
      expect(checklist.allComplete).toBe(false)
    })

    it("skips are per event", async () => {
      const a = await seedEvent("OneTime")
      const b = await seedEvent("OneTime")
      await setEventSetupStepSkipped(a.id, "checkin", true)

      expect((await checklistWithSkips(b.id)).skippedCount).toBe(0)
    })

    it("isSetupStepKey guards exactly the published keys", () => {
      for (const key of SETUP_STEP_KEYS) expect(isSetupStepKey(key)).toBe(true)
      expect(isSetupStepKey("committee")).toBe(false)
      expect(isSetupStepKey("")).toBe(false)
    })
  })

  it("dismissEventSetup sets setupDismissedAt", async () => {
    const event = await seedEvent("OneTime")
    const result = await dismissEventSetup(event.id)

    expect(result.success).toBe(true)
    const updated = await db.event.findUnique({ where: { id: event.id } })
    expect(updated?.setupDismissedAt).toBeInstanceOf(Date)
  })
})
