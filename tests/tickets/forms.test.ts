import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { saveFormConfig, setFormOpen } from "@/app/(dashboard)/forms/actions"
import { getFormConfig } from "@/lib/forms/config"
import { setRegistrationFormModule } from "@/app/(dashboard)/events/module-actions"
import { updateRegistrationPage } from "@/app/(dashboard)/events/registration-page-actions"
import { scopeKeyFor } from "@/lib/forms/registry"

/**
 * Forms feature — server actions + DB state.
 *  - integration: upsert by scopeKey, open/close toggle, synthesized default
 *  - relocation: registration field/page actions still persist from the Forms editor
 *  - regression: a closed config reports closed
 */

async function makeEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
    },
    select: { id: true },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "FormConfig", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("forms — getFormConfig defaults", () => {
  it("returns an open, override-free default when no row exists", async () => {
    const cfg = await getFormConfig("JoinSmallGroup")
    expect(cfg.isOpen).toBe(true)
    expect(cfg.title).toBeNull()
    expect(cfg.primaryColor).toBeNull()
  })
})

describe("forms — saveFormConfig", () => {
  it("upserts by scopeKey (create then update, no duplicate row)", async () => {
    const r1 = await saveFormConfig("JoinSmallGroup", null, {
      isOpen: true,
      title: "First",
    })
    expect(r1.success).toBe(true)

    const r2 = await saveFormConfig("JoinSmallGroup", null, {
      isOpen: true,
      title: "Second",
    })
    expect(r2.success).toBe(true)

    const rows = await db.formConfig.findMany({ where: { key: "JoinSmallGroup" } })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe("Second")
    expect(rows[0].scopeKey).toBe(scopeKeyFor("JoinSmallGroup"))
  })

  it("normalizes blank overrides to null (falls back to defaults)", async () => {
    await saveFormConfig("JoinSmallGroup", null, { isOpen: true, title: "  " })
    const cfg = await getFormConfig("JoinSmallGroup")
    expect(cfg.title).toBeNull()
  })

  it("scopes event configs separately from global", async () => {
    const event = await makeEvent()
    await saveFormConfig("CatchMech", event.id, { isOpen: false })
    await saveFormConfig("JoinSmallGroup", null, { isOpen: true })

    const eventCfg = await getFormConfig("CatchMech", event.id)
    expect(eventCfg.isOpen).toBe(false)
    expect(eventCfg.eventId).toBe(event.id)
  })

  it("rejects an invalid hex color", async () => {
    const r = await saveFormConfig("JoinSmallGroup", null, { primaryColor: "red" })
    expect(r.success).toBe(false)
  })
})

describe("forms — setFormOpen (regression: closed reports closed)", () => {
  it("flips isOpen and getFormConfig reflects it", async () => {
    const event = await makeEvent()

    await setFormOpen("EventRegistration", event.id, false)
    let cfg = await getFormConfig("EventRegistration", event.id)
    expect(cfg.isOpen).toBe(false)

    await setFormOpen("EventRegistration", event.id, true)
    cfg = await getFormConfig("EventRegistration", event.id)
    expect(cfg.isOpen).toBe(true)
  })
})

describe("forms — relocated registration config still persists", () => {
  // Section/field toggles moved to EventFormConfig in CCF-119/120 — see
  // tests/tickets/ccf-120.test.ts. Auto-assign is the one flat column left here.
  it("setRegistrationFormModule writes the Event field", async () => {
    const event = await makeEvent()
    const r = await setRegistrationFormModule(event.id, "AutoAssignBreakout", true)
    expect(r.success).toBe(true)

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { autoAssignBreakout: true },
    })
    expect(updated?.autoAssignBreakout).toBe(true)
  })

  it("updateRegistrationPage writes the page fields read by the register page", async () => {
    const event = await makeEvent()
    const r = await updateRegistrationPage(event.id, {
      registrationPageTitle: "Camp Sign Up",
      registrationPageDescription: "Join us",
      registrationPageBannerUrl: "",
    })
    expect(r.success).toBe(true)

    const updated = await db.event.findUnique({
      where: { id: event.id },
      select: { registrationPageTitle: true, registrationPageDescription: true },
    })
    expect(updated?.registrationPageTitle).toBe("Camp Sign Up")
    expect(updated?.registrationPageDescription).toBe("Join us")
  })
})
