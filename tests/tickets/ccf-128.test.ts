import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { enableModule, disableModule } from "@/app/(dashboard)/events/module-actions"
import {
  getEffectiveFormConfig,
  getEffectiveFormConfigs,
} from "@/lib/forms/context-config-server"
import { eventFormsForModules } from "@/lib/forms/registry"
import { assignBreakoutForRegistrant } from "@/lib/events/registration-core"

/**
 * CCF-128 — Breakout Groups as a module, and the module-driven form sections.
 *
 * The payment and breakout steps are overlaid onto the stored form config on read
 * (`applyModuleGates`), so the module is the single gate and there is no stored
 * flag that can drift away from it.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "EventModule", "BreakoutGroupMember", "BreakoutGroup", "SmallGroupMemberRequest", "EventRegistrant", "Guest", "Event" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

async function makeEvent() {
  const event = await db.event.create({
    data: {
      name: "Form Gate Event",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
    select: { id: true },
  })
  return event.id
}

describe("payment section follows the Priced module", () => {
  it("is off when the module is off, even with the stored flag set", async () => {
    const eventId = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId, context: "Register", sectionPayment: true },
    })

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionPayment).toBe(false)
  })

  it("is on when the module is on, even with the stored flag unset", async () => {
    const eventId = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId, context: "Register", sectionPayment: false },
    })
    await enableModule(eventId, "Priced")

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionPayment).toBe(true)
  })

  it("is on for an event with no stored config row at all", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Priced")

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionPayment).toBe(true)
  })
})

describe("breakout section requires the Breakout module", () => {
  it("is suppressed while the module is off", async () => {
    const eventId = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId, context: "Register", sectionBreakout: true },
    })

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionBreakout).toBe(false)
  })

  it("honours the admin's stored choice once the module is on", async () => {
    const eventId = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId, context: "Register", sectionBreakout: true },
    })
    await enableModule(eventId, "Breakout")

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionBreakout).toBe(true)
  })

  it("stays off with the module on when the admin hasn't opted in", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Breakout")

    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionBreakout).toBe(false)
  })

  it("applies the same gates across every context", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Priced")

    const configs = await getEffectiveFormConfigs(eventId)

    expect(configs.Register.sectionPayment).toBe(true)
    expect(configs.WalkIn.sectionPayment).toBe(true)
    expect(configs.CheckIn.sectionPayment).toBe(true)
  })

  it("re-suppresses the breakout step when the module is turned back off", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Breakout")
    await db.eventFormConfig.upsert({
      where: { eventId_context: { eventId, context: "Register" } },
      create: { eventId, context: "Register", sectionBreakout: true },
      update: { sectionBreakout: true },
    })

    await disableModule(eventId, "Breakout")
    const config = await getEffectiveFormConfig(eventId, "Register")

    expect(config.sectionBreakout).toBe(false)
  })
})

describe("volunteer forms are listed only with the Volunteers module", () => {
  it("hides all three volunteer forms when the module is off", () => {
    const keys = eventFormsForModules([]).map((f) => f.key)

    expect(keys).not.toContain("VolunteerSignUp")
    expect(keys).not.toContain("VolunteerInfo")
    expect(keys).not.toContain("VolunteerApproval")
  })

  it("lists them once the module is on", () => {
    const keys = eventFormsForModules(["Volunteers"]).map((f) => f.key)

    expect(keys).toContain("VolunteerSignUp")
    expect(keys).toContain("VolunteerInfo")
    expect(keys).toContain("VolunteerApproval")
  })

  it("keeps the registration and check-in forms listed regardless", () => {
    const keys = eventFormsForModules([]).map((f) => f.key)

    expect(keys).toContain("EventRegistration")
    expect(keys).toContain("EventCheckIn")
  })
})

/**
 * Regression — the module has to gate the *write*, not just the surfaces that
 * offer it. `Event.autoAssignBreakout` is a flat column that outlives the module
 * row, so an event that once had Breakout on could keep placing registrants into
 * groups its admin can no longer open.
 */
describe("regression — auto-assign stops when the Breakout module is off", () => {
  async function seedAutoAssignEvent() {
    const eventId = await makeEvent()
    await enableModule(eventId, "Breakout")
    await db.event.update({
      where: { id: eventId },
      data: { autoAssignBreakout: true },
    })
    const group = await db.breakoutGroup.create({
      data: { eventId, name: "Group A" },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "Auto", lastName: "Assign", language: [] },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId, guestId: guest.id },
      select: { id: true },
    })
    return { eventId, groupId: group.id, registrantId: registrant.id }
  }

  it("assigns while the module is on", async () => {
    const { eventId, registrantId } = await seedAutoAssignEvent()

    const assigned = await assignBreakoutForRegistrant(registrantId, eventId, null, {
      gender: null,
      birthYear: null,
    })

    expect(assigned?.name).toBe("Group A")
    expect(await db.breakoutGroupMember.count({ where: { registrantId } })).toBe(1)
  })

  it("assigns nothing once the module is disabled", async () => {
    const { eventId, registrantId } = await seedAutoAssignEvent()

    expect((await disableModule(eventId, "Breakout")).success).toBe(true)

    const assigned = await assignBreakoutForRegistrant(registrantId, eventId, null, {
      gender: null,
      birthYear: null,
    })

    expect(assigned).toBeNull()
    expect(await db.breakoutGroupMember.count({ where: { registrantId } })).toBe(0)
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("retires autoAssignBreakout so re-enabling doesn't silently resume it", async () => {
    const { eventId } = await seedAutoAssignEvent()

    await disableModule(eventId, "Breakout")

    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { autoAssignBreakout: true },
    })
    expect(event?.autoAssignBreakout).toBe(false)
  })

  it("ignores an explicit breakout pick too, not just auto-assign", async () => {
    const { eventId, groupId, registrantId } = await seedAutoAssignEvent()
    await disableModule(eventId, "Breakout")

    const assigned = await assignBreakoutForRegistrant(registrantId, eventId, groupId, {
      gender: null,
      birthYear: null,
    })

    expect(assigned).toBeNull()
    expect(await db.breakoutGroupMember.count({ where: { registrantId } })).toBe(0)
  })
})
