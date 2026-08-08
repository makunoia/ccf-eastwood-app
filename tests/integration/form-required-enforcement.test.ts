/**
 * CCF-142 — Required fields and the mobile/email toggles, enforced server-side.
 *
 * Registration is a public endpoint, so "the form wouldn't let you submit that"
 * is not enforcement. Everything here bypasses the client entirely and calls the
 * action the way a crafted POST would.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import {
  saveEventFormConfig,
  setEventFormToggle,
} from "@/app/(dashboard)/events/form-config-actions"
import { getEventFormConfig } from "@/lib/forms/context-config-server"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "Event", "EventRegistrant", "EventFormConfig", "LifeStage" RESTART IDENTITY CASCADE`
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

const PERSON = {
  firstName: "Juan",
  lastName: "dela Cruz",
  mobileNumber: "09171234567",
}

describe("required fields on the public registration path", () => {
  it("rejects a submission missing a required field", async () => {
    const event = await seedEvent()
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        fieldLifeStage: true,
        fieldLifeStageRequired: true,
      },
    })

    const result = await createRegistrant(event.id, { ...PERSON, lifeStageId: null }, null)
    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain("Life Stage")
    expect(await db.eventRegistrant.count()).toBe(0)

    const ok = await createRegistrant(event.id, { ...PERSON, lifeStageId: lifeStage.id }, null)
    expect(ok.success).toBe(true)
  })

  it("ignores a required flag left on a field that has since been switched off", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        fieldLifeStage: false,
        fieldLifeStageRequired: true,
      },
    })

    const result = await createRegistrant(event.id, { ...PERSON, lifeStageId: null }, null)
    expect(result.success).toBe(true)
  })

  it("does not require a DGroup field of someone who isn't looking for a group", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        sectionSmallGroup: true,
        fieldLanguage: true,
        fieldLanguageRequired: true,
      },
    })

    // They never saw the question, so it can't block them.
    const skipped = await createRegistrant(event.id, {
      ...PERSON,
      wantsSmallGroup: false,
      language: [],
    }, null)
    expect(skipped.success).toBe(true)

    // Someone who did opt in is held to it.
    const blocked = await createRegistrant(event.id, {
      firstName: "Ana",
      lastName: "Reyes",
      mobileNumber: "09181234567",
      wantsSmallGroup: true,
      language: [],
    }, null)
    expect(blocked.success).toBe(false)
    expect(blocked.success === false && blocked.error).toContain("Language")
  })

  it("requires a mobile number when the admin says so", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldMobileRequired: true },
    })

    const result = await createRegistrant(event.id, {
      firstName: "Juan",
      lastName: "dela Cruz",
      mobileNumber: "",
      email: "juan@example.com",
    }, null)
    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain("Mobile Number")
  })

  it("drops a mobile number the form doesn't collect", async () => {
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldMobile: false },
    })

    const result = await createRegistrant(event.id, {
      ...PERSON,
      email: "juan@example.com",
    }, null)
    expect(result.success).toBe(true)

    const guest = await db.guest.findFirst()
    expect(guest?.phone).toBeNull()
    expect(guest?.email).toBe("juan@example.com")
  })

  it("registers exactly as before on an event with no config row", async () => {
    // Regression for the defaults change: "bare" now means identity-only rather
    // than every column false, so an unconfigured event must still take both.
    const event = await seedEvent()

    const result = await createRegistrant(event.id, {
      ...PERSON,
      email: "juan@example.com",
    }, null)
    expect(result.success).toBe(true)

    const guest = await db.guest.findFirst()
    expect(guest?.phone).toBe("+63 917 123 4567")
    expect(guest?.email).toBe("juan@example.com")
  })

  it("stores null for a life stage and age range left unset", async () => {
    // CCF-143 removed the "Prefer not to say" item; the placeholder state has to
    // round-trip the same way the sentinel used to.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        fieldLifeStage: true,
        fieldAgeRange: true,
      },
    })

    const result = await createRegistrant(event.id, {
      ...PERSON,
      lifeStageId: null,
      ageRangeBucketId: null,
    }, null)
    expect(result.success).toBe(true)

    const guest = await db.guest.findFirst()
    expect(guest?.lifeStageId).toBeNull()
    expect(guest?.ageRangeBucketId).toBeNull()
  })
})

describe("the identity guard", () => {
  it("refuses to leave a form with neither mobile nor email", async () => {
    const event = await seedEvent()

    const offEmail = await setEventFormToggle(event.id, "Register", "fieldEmail", false)
    expect(offEmail.success).toBe(true)

    const offMobile = await setEventFormToggle(event.id, "Register", "fieldMobile", false)
    expect(offMobile.success).toBe(false)
    expect(offMobile.success === false && offMobile.error).toContain("at least one")

    const stored = await getEventFormConfig(event.id, "Register")
    expect(stored.fieldMobile).toBe(true)
  })

  it("blocks a single write that turns both off at once", async () => {
    const event = await seedEvent()

    const result = await saveEventFormConfig(event.id, "Register", {
      fieldMobile: false,
      fieldEmail: false,
    })
    expect(result.success).toBe(false)

    const stored = await getEventFormConfig(event.id, "Register")
    expect(stored.fieldMobile).toBe(true)
    expect(stored.fieldEmail).toBe(true)
  })

  it("allows turning one off while the other is on", async () => {
    const event = await seedEvent()

    expect((await setEventFormToggle(event.id, "Register", "fieldMobile", false)).success).toBe(
      true
    )
    const stored = await getEventFormConfig(event.id, "Register")
    expect(stored.fieldMobile).toBe(false)
    expect(stored.fieldEmail).toBe(true)
  })

  it("persists a Required flag through the toggle action", async () => {
    const event = await seedEvent()

    const result = await setEventFormToggle(
      event.id,
      "Register",
      "fieldLifeStageRequired",
      true
    )
    expect(result.success).toBe(true)

    const stored = await getEventFormConfig(event.id, "Register")
    expect(stored.fieldLifeStageRequired).toBe(true)
  })
})
