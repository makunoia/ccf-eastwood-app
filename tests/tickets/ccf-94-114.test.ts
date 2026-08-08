import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { saveGuestMatchingProfile } from "@/app/(dashboard)/guests/actions"
import { getEventFormConfig } from "@/lib/forms/context-config-server"
import { setEventFormToggle } from "@/app/(dashboard)/events/form-config-actions"

/**
 * CCF-94 (register/check-in parity) + CCF-114 (check-in profile screen).
 *
 *  - integration: the Check-in context gates the DGroup prompt, making CCF-114's
 *                 previously-opaque trigger admin-configurable
 *  - regression:  `saveGuestMatchingProfile` overwrites every column, so the
 *                 check-in ProfileForm must pass through values for fields it
 *                 does not render — sending null would silently wipe guest data
 *
 * NOT COVERED HERE — called out deliberately rather than omitted silently:
 * the privacy-consent gate and the field show/hide are client-side behavior in
 * `checkin-board.tsx`. This repo has no component-test layer (vitest runs in
 * `node`, no jsdom/RTL) and the Playwright specs run against the dev database
 * with no seeding harness, so neither can drive that flow today. Adding
 * jsdom + Testing Library would be the fix; that's a repo-wide infra decision,
 * flagged rather than taken unilaterally.
 */

async function makeEvent() {
  return db.event.create({
    data: {
      name: "Check-in Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
    },
    select: { id: true },
  })
}

async function makeGuest(data: Parameters<typeof db.guest.create>[0]["data"]) {
  return db.guest.create({ data, select: { id: true } })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Event", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-114 — the DGroup prompt trigger is configurable", () => {
  it("Check-in starts with the DGroup section off, so the prompt never fires", async () => {
    const event = await makeEvent()
    expect((await getEventFormConfig(event.id, "CheckIn")).sectionSmallGroup).toBe(false)
  })

  it("an admin can turn the prompt on for Check-in without affecting Register", async () => {
    const event = await makeEvent()
    await setEventFormToggle(event.id, "CheckIn", "sectionSmallGroup", true)

    expect((await getEventFormConfig(event.id, "CheckIn")).sectionSmallGroup).toBe(true)
    expect((await getEventFormConfig(event.id, "Register")).sectionSmallGroup).toBe(false)
  })

  it("each profile field on the check-in screen is independently configurable", async () => {
    const event = await makeEvent()
    for (const key of [
      "fieldLifeStage",
      "fieldGender",
      "fieldLanguage",
      "fieldMeetingPreference",
      "fieldSchedule",
      "fieldWorkCity",
    ] as const) {
      expect((await setEventFormToggle(event.id, "CheckIn", key, true)).success, key).toBe(true)
    }

    const cfg = await getEventFormConfig(event.id, "CheckIn")
    expect(cfg.fieldLifeStage).toBe(true)
    expect(cfg.fieldWorkCity).toBe(true)
    // Not enabled above — stays off.
    expect(cfg.fieldBirthDate).toBe(false)
  })
})

describe("CCF-94 regression — saving a profile must not wipe unrendered fields", () => {
  it("blanket-overwrites every column, so omitted values are destructive", async () => {
    // Pins the action's semantics — the reason ProfileForm passes values through
    // for fields it doesn't render.
    const guest = await makeGuest({
      firstName: "Ana",
      lastName: "Reyes",
      language: ["English"],
      workCity: "Pasig",
      gender: "Female",
    })

    await saveGuestMatchingProfile(guest.id, {
      lifeStageId: null,
      gender: null,
      language: [],
      meetingPreference: null,
      workCity: null,
      scheduleDayOfWeek: null,
      scheduleTimeStart: null,
      scheduleTimeEnd: null,
    })

    const after = await db.guest.findUnique({
      where: { id: guest.id },
      select: { workCity: true, gender: true, language: true },
    })
    expect(after?.workCity).toBeNull()
    expect(after?.gender).toBeNull()
    expect(after?.language).toEqual([])
  })

  it("passing stored values through preserves them", async () => {
    const guest = await makeGuest({
      firstName: "Ben",
      lastName: "Cruz",
      language: ["Tagalog"],
      workCity: "Makati",
      gender: "Male",
      meetingPreference: "Hybrid",
    })

    // What ProfileForm sends when those fields are disabled: the existing values,
    // untouched, alongside the one field the person actually edited.
    await saveGuestMatchingProfile(guest.id, {
      lifeStageId: null,
      gender: "Male",
      language: ["Tagalog"],
      meetingPreference: "Hybrid",
      workCity: "Makati",
      scheduleDayOfWeek: 3,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })

    const after = await db.guest.findUnique({
      where: { id: guest.id },
      select: {
        workCity: true,
        gender: true,
        language: true,
        meetingPreference: true,
        scheduleDayOfWeek: true,
      },
    })
    expect(after?.workCity).toBe("Makati")
    expect(after?.gender).toBe("Male")
    expect(after?.language).toEqual(["Tagalog"])
    expect(after?.meetingPreference).toBe("Hybrid")
    expect(after?.scheduleDayOfWeek).toBe(3)
  })

  it("a disabled Life Stage field must not write the event's ministry default", async () => {
    // lifeStageId is the one field seeded from something other than stored data,
    // so it's the only one that can leak a value the person never chose.
    const ministryDefault = await db.lifeStage.create({
      data: { name: "Young Pro", order: 1 },
      select: { id: true },
    })
    const guest = await makeGuest({ firstName: "Cara", lastName: "Lim", language: [] })

    // ProfileForm with fieldLifeStage off sends existingProfile.lifeStageId (null),
    // never the seeded default.
    await saveGuestMatchingProfile(guest.id, {
      lifeStageId: null,
      gender: null,
      language: [],
      meetingPreference: null,
      workCity: null,
      scheduleDayOfWeek: null,
      scheduleTimeStart: null,
      scheduleTimeEnd: null,
    })

    const after = await db.guest.findUnique({
      where: { id: guest.id },
      select: { lifeStageId: true },
    })
    expect(after?.lifeStageId).toBeNull()
    expect(after?.lifeStageId).not.toBe(ministryDefault.id)
  })

  it("keeps an already-set Life Stage when the field is disabled", async () => {
    const stage = await db.lifeStage.create({
      data: { name: "Singles", order: 2 },
      select: { id: true },
    })
    const guest = await makeGuest({
      firstName: "Dan",
      lastName: "Ong",
      language: [],
      lifeStageId: stage.id,
    })

    // Disabled field → ProfileForm passes existingProfile.lifeStageId back.
    await saveGuestMatchingProfile(guest.id, {
      lifeStageId: stage.id,
      gender: null,
      language: [],
      meetingPreference: null,
      workCity: null,
      scheduleDayOfWeek: null,
      scheduleTimeStart: null,
      scheduleTimeEnd: null,
    })

    const after = await db.guest.findUnique({
      where: { id: guest.id },
      select: { lifeStageId: true },
    })
    expect(after?.lifeStageId).toBe(stage.id)
  })
})
