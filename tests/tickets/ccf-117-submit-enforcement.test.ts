import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  addHouseholdMemberAtCheckin,
  createHouseholdRegistration,
  createRegistrant,
} from "@/app/(dashboard)/events/actions"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_FIELD_KEYS,
  FORM_SECTION_KEYS,
  type EventFormConfigData,
} from "@/lib/forms/context-config"
import {
  REGISTRANT_FIELD_GATES,
  fieldKeysWithoutGate,
  resolveBreakoutSelection,
  sanitizeHouseholdMember,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"

/**
 * CCF-117 — the form config is enforced on submit, not just on render.
 *
 * The public form already withholds every disabled field, so none of this changes
 * behavior for real traffic. It closes the gap where a crafted POST to the public
 * registration endpoint could store a field the admin had turned off.
 *
 *  - unit:        the gate map and the sanitizer
 *  - integration: a crafted payload against a bare / partially-enabled event
 *  - regression:  enforcement must NEVER erase an already-stored answer — it drops
 *                 the incoming value, it does not write null
 *  - edge case:   household refused when the section is off; breakout pick ignored
 *                 while auto-assign keeps working
 */

const ALL_ON = Object.fromEntries(
  [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS].map((k) => [k, true])
) as EventFormConfigData

function cfg(overrides: Partial<EventFormConfigData> = {}): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...overrides }
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "EventRegistrant", "EventFormConfig", "Event", "Guest", "Member",
    "SchedulePreference", "AgeRangeBucket", "LifeStage", "FamilyMember", "Family",
    "BreakoutGroup"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(config: Partial<EventFormConfigData>, autoAssignBreakout = false) {
  // The breakout and payment steps are module-gated on top of the stored config
  // (CCF-128), so asking for one here means enabling the module behind it.
  // Auto-assign needs the Breakout module too — it places people into breakout
  // groups, which is the module's whole point.
  const modules: { type: "Breakout" | "Priced" }[] = []
  if (config.sectionBreakout || autoAssignBreakout) modules.push({ type: "Breakout" })
  if (config.sectionPayment) modules.push({ type: "Priced" })

  const event = await db.event.create({
    data: {
      name: "Enforced Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      autoAssignBreakout,
      eventFormConfigs: { create: [{ context: "Register", ...config }] },
      ...(modules.length > 0 ? { modules: { create: modules } } : {}),
    },
    select: { id: true },
  })
  return event.id
}

// ─── Unit ────────────────────────────────────────────────────────────────────

describe("unit — the gate map", () => {
  it("gates every field toggle the builder offers", () => {
    // A field toggle that gates nothing would be decorative: the admin turns it
    // off and the server keeps storing the value anyway.
    expect(fieldKeysWithoutGate()).toEqual([])
  })

  it("maps birth month and year to the single Birth Date toggle", () => {
    expect(REGISTRANT_FIELD_GATES.birthMonth).toBe("fieldBirthDate")
    expect(REGISTRANT_FIELD_GATES.birthYear).toBe("fieldBirthDate")
  })

  it("maps all three schedule parts to one Schedule toggle", () => {
    expect(REGISTRANT_FIELD_GATES.scheduleDayOfWeek).toBe("fieldSchedule")
    expect(REGISTRANT_FIELD_GATES.scheduleTimeStart).toBe("fieldSchedule")
    expect(REGISTRANT_FIELD_GATES.scheduleTimeEnd).toBe("fieldSchedule")
  })
})

describe("unit — sanitizeRegistrantPayload", () => {
  const payload = {
    firstName: "Ana",
    lastName: "Reyes",
    birthYear: 1994,
    workCity: "Pasig",
    language: ["English"],
    gender: "Female",
    dietaryPreference: "Halal",
    paymentReference: "GCASH-1",
  }

  it("strips everything on a bare config but keeps identity fields", () => {
    const out = sanitizeRegistrantPayload(cfg(), payload)
    expect(out.firstName).toBe("Ana")
    expect(out.lastName).toBe("Reyes")
    expect(out.birthYear).toBeNull()
    expect(out.workCity).toBeNull()
    expect(out.gender).toBeNull()
    expect(out.dietaryPreference).toBeNull()
    expect(out.paymentReference).toBeNull()
  })

  it("empties a disabled list field to [] rather than null", () => {
    expect(sanitizeRegistrantPayload(cfg(), payload).language).toEqual([])
  })

  it("passes an enabled field through untouched", () => {
    const out = sanitizeRegistrantPayload(cfg({ fieldWorkCity: true }), payload)
    expect(out.workCity).toBe("Pasig")
    expect(out.birthYear).toBeNull()
  })

  it("is a no-op when everything is enabled", () => {
    expect(sanitizeRegistrantPayload(ALL_ON, payload)).toEqual(payload)
  })

  it("leaves absent keys absent instead of inventing nulls", () => {
    const out = sanitizeRegistrantPayload(cfg(), { firstName: "Ana" })
    expect("workCity" in out).toBe(false)
  })

  it("does not mutate its input", () => {
    const original = { ...payload }
    sanitizeRegistrantPayload(cfg(), payload)
    expect(payload).toEqual(original)
  })
})

describe("unit — household and breakout gates", () => {
  it("strips a household member's disabled demographics", () => {
    const member = { firstName: "Kid", birthYear: 2015, gender: "Male", ageRangeBucketId: "b1" }
    const out = sanitizeHouseholdMember(cfg({ fieldGender: true }), member)
    expect(out.gender).toBe("Male")
    expect(out.birthYear).toBeNull()
    expect(out.ageRangeBucketId).toBeNull()
    expect(out.firstName).toBe("Kid")
  })

  it("ignores a breakout pick when the section is off, honors it when on", () => {
    expect(resolveBreakoutSelection(cfg(), "bg1")).toBeNull()
    expect(resolveBreakoutSelection(cfg({ sectionBreakout: true }), "bg1")).toBe("bg1")
    expect(resolveBreakoutSelection(cfg({ sectionBreakout: true }), null)).toBeNull()
  })
})

// ─── Integration ─────────────────────────────────────────────────────────────

describe("integration — a crafted payload cannot store disabled fields", () => {
  it("stores nothing optional against a bare event", async () => {
    const eventId = await seedEvent({})
    const bucket = await db.ageRangeBucket.create({
      data: { label: "30 – 39", minAge: 30, maxAge: 39, order: 3 },
      select: { id: true },
    })
    const lifeStage = await db.lifeStage.create({
      data: { name: "Young Pro", order: 1 },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      {
        firstName: "Ella",
        lastName: "Santos",
        mobileNumber: "09171112222",
        // Everything below is disabled on this event's form.
        birthMonth: 4,
        birthYear: 1994,
        ageRangeBucketId: bucket.id,
        lifeStageId: lifeStage.id,
        gender: "Female",
        language: ["English"],
        meetingPreference: "Hybrid",
        workCity: "Pasig",
        scheduleDayOfWeek: 3,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
        dietaryPreference: "Halal",
        paymentReference: "GCASH-1",
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({
      select: {
        firstName: true,
        phone: true,
        birthMonth: true,
        birthYear: true,
        ageRangeBucketId: true,
        lifeStageId: true,
        gender: true,
        language: true,
        meetingPreference: true,
        workCity: true,
        scheduleDayOfWeek: true,
      },
    })
    // Identity is always collected — that's the "bare" form.
    expect(guest.firstName).toBe("Ella")
    expect(guest.phone).toBe("+63 917 111 2222")
    // Nothing else was asked for, so nothing else was kept.
    expect(guest.birthMonth).toBeNull()
    expect(guest.birthYear).toBeNull()
    expect(guest.ageRangeBucketId).toBeNull()
    expect(guest.lifeStageId).toBeNull()
    expect(guest.gender).toBeNull()
    expect(guest.language).toEqual([])
    expect(guest.meetingPreference).toBeNull()
    expect(guest.workCity).toBeNull()
    expect(guest.scheduleDayOfWeek).toBeNull()

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      select: { dietaryPreference: true, paymentReference: true },
    })
    expect(registrant.dietaryPreference).toBeNull()
    expect(registrant.paymentReference).toBeNull()
  })

  it("keeps exactly the fields the event does enable", async () => {
    const eventId = await seedEvent({ fieldWorkCity: true, sectionDietary: true })

    const res = await createRegistrant(
      eventId,
      {
        firstName: "Ella",
        lastName: "Santos",
        mobileNumber: "09171112222",
        workCity: "Pasig",
        dietaryPreference: "Halal",
        gender: "Female",
        birthYear: 1994,
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({
      select: { workCity: true, gender: true, birthYear: true },
    })
    expect(guest.workCity).toBe("Pasig")
    expect(guest.gender).toBeNull()
    expect(guest.birthYear).toBeNull()

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      select: { dietaryPreference: true },
    })
    expect(registrant.dietaryPreference).toBe("Halal")
  })

  it("applies the WalkIn context's config, not Register's", async () => {
    const event = await db.event.create({
      data: {
        name: "Two Contexts",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        eventFormConfigs: {
          create: [
            { context: "Register", fieldWorkCity: true },
            { context: "WalkIn", fieldWorkCity: false, fieldGender: true },
          ],
        },
      },
      select: { id: true },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Ella",
        lastName: "Santos",
        mobileNumber: "09171112222",
        workCity: "Pasig",
        gender: "Female",
      },
      null,
      null,
      false,
      null,
      { occurrenceId: null }
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { workCity: true, gender: true } })
    // Walk-in disables Work City even though Register allows it.
    expect(guest.workCity).toBeNull()
    expect(guest.gender).toBe("Female")
  })
})

describe("regression — enforcement drops the input, it never erases stored data", () => {
  it("leaves a returning guest's stored answers alone when the field is now disabled", async () => {
    // The dangerous way to implement this would be to write null for every
    // disabled field. That would wipe answers collected while the field was on.
    const eventId = await seedEvent({})
    const bucket = await db.ageRangeBucket.create({
      data: { label: "30 – 39", minAge: 30, maxAge: 39, order: 3 },
      select: { id: true },
    })
    await db.guest.create({
      data: {
        firstName: "Ella",
        lastName: "Santos",
        phone: "+63 917 111 2222",
        language: ["Tagalog"],
        gender: "Female",
        birthMonth: 4,
        birthYear: 1994,
        workCity: "Makati",
        meetingPreference: "Online",
        ageRangeBucketId: bucket.id,
        scheduleDayOfWeek: 6,
        scheduleTimeStart: "09:00",
      },
    })

    const res = await createRegistrant(
      eventId,
      {
        firstName: "Ella",
        lastName: "Santos",
        mobileNumber: "09171112222",
        // A crafted attempt to change data the form no longer collects.
        workCity: "Cebu",
        gender: "Male",
        birthYear: 2000,
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({
      select: {
        gender: true,
        birthMonth: true,
        birthYear: true,
        workCity: true,
        language: true,
        meetingPreference: true,
        ageRangeBucketId: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
      },
    })
    expect(guest).toEqual({
      gender: "Female",
      birthMonth: 4,
      birthYear: 1994,
      workCity: "Makati",
      language: ["Tagalog"],
      meetingPreference: "Online",
      ageRangeBucketId: bucket.id,
      scheduleDayOfWeek: 6,
      scheduleTimeStart: "09:00",
    })
  })

  it("leaves a member's stored answers and schedule alone", async () => {
    const eventId = await seedEvent({})
    const member = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: ["Cebuano"],
        workCity: "Makati",
        schedulePreferences: { create: { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" } },
      },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      {
        firstName: "Ana",
        lastName: "Reyes",
        workCity: "Cebu",
        scheduleDayOfWeek: 1,
        scheduleTimeStart: "18:00",
        scheduleTimeEnd: "20:00",
      },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: {
        workCity: true,
        language: true,
        schedulePreferences: { select: { dayOfWeek: true, timeStart: true } },
      },
    })
    expect(after.workCity).toBe("Makati")
    expect(after.language).toEqual(["Cebuano"])
    expect(after.schedulePreferences).toEqual([{ dayOfWeek: 6, timeStart: "09:00" }])
  })

  it("adds no schedule for a member when the Schedule field is off", async () => {
    const eventId = await seedEvent({})
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    expect(
      (
        await createRegistrant(
          eventId,
          {
            firstName: "Ana",
            lastName: "Reyes",
            scheduleDayOfWeek: 3,
            scheduleTimeStart: "19:00",
            scheduleTimeEnd: "21:00",
          },
          member.id
        )
      ).success
    ).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { schedulePreferences: { select: { id: true } } },
    })
    expect(after.schedulePreferences).toEqual([])
  })
})

describe("edge case — sections", () => {
  it("refuses household members when the Family section is off", async () => {
    // Refused rather than silently dropped: a success response that quietly lost
    // half the household would be worse than an error.
    const eventId = await seedEvent({})

    const res = await createHouseholdRegistration(
      eventId,
      { firstName: "Ana", lastName: "Reyes", mobileNumber: "09171112222" },
      {
        primaryRole: "MotherWife",
        members: [{ firstName: "Kid", lastName: "Reyes", role: "Child" }],
      },
      null
    )
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("household")

    expect(await db.family.count()).toBe(0)
    expect(await db.eventRegistrant.count()).toBe(0)
  })

  it("accepts a household when the Family section is on", async () => {
    const eventId = await seedEvent({ sectionFamily: true })

    const res = await createHouseholdRegistration(
      eventId,
      { firstName: "Ana", lastName: "Reyes", mobileNumber: "09171112222" },
      {
        primaryRole: "MotherWife",
        members: [{ firstName: "Kid", lastName: "Reyes", role: "Child" }],
      },
      null
    )
    expect(res.success).toBe(true)
    expect(await db.family.count()).toBe(1)
    expect(await db.eventRegistrant.count()).toBe(2)
  })

  it("still allows a solo submission through the household action with the section off", async () => {
    // A household of one is just a normal registration — nothing to refuse.
    const eventId = await seedEvent({})

    const res = await createHouseholdRegistration(
      eventId,
      { firstName: "Ana", lastName: "Reyes", mobileNumber: "09171112222" },
      { primaryRole: "MotherWife", members: [] },
      null
    )
    expect(res.success).toBe(true)
  })

  it("refuses to add a family member at check-in when the Family section is off", async () => {
    // `addHouseholdMemberAtCheckin` is the one check-in path that creates family
    // structure, so it obeys the Check-in context's Family section.
    const event = await db.event.create({
      data: {
        name: "Door Event",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        eventFormConfigs: { create: [{ context: "CheckIn", sectionFamily: false }] },
      },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "Ana", lastName: "Reyes", phone: "+63 917 111 2222", language: [] },
      select: { id: true },
    })
    const subject = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })

    const res = await addHouseholdMemberAtCheckin(
      event.id,
      subject.id,
      { firstName: "Kid", lastName: "Reyes", role: "Child" },
      null
    )
    expect(res.success).toBe(false)
    expect(await db.family.count()).toBe(0)
  })

  it("allows adding a family member at check-in when the section is on", async () => {
    const event = await db.event.create({
      data: {
        name: "Door Event",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        eventFormConfigs: { create: [{ context: "CheckIn", sectionFamily: true }] },
      },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "Ana", lastName: "Reyes", phone: "+63 917 111 2222", language: [] },
      select: { id: true },
    })
    const subject = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })

    const res = await addHouseholdMemberAtCheckin(
      event.id,
      subject.id,
      { firstName: "Kid", lastName: "Reyes", role: "Child" },
      null
    )
    expect(res.success).toBe(true)
    expect(await db.family.count()).toBe(1)
  })

  it("ignores a breakout pick when the Breakout section is off", async () => {
    const eventId = await seedEvent({})
    const group = await db.breakoutGroup.create({
      data: { eventId, name: "Group A" },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222" },
      null,
      null,
      false,
      group.id
    )
    expect(res.success).toBe(true)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("honors a breakout pick when the Breakout section is on", async () => {
    const eventId = await seedEvent({ sectionBreakout: true })
    const group = await db.breakoutGroup.create({
      data: { eventId, name: "Group A" },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222" },
      null,
      null,
      false,
      group.id
    )
    expect(res.success).toBe(true)

    const placements = await db.breakoutGroupMember.findMany({
      select: { breakoutGroupId: true },
    })
    expect(placements).toEqual([{ breakoutGroupId: group.id }])
  })

  it("leaves auto-assign working even with the Breakout section off", async () => {
    // Auto-assign is placement behavior, not a form section — gating the picker
    // must not disable it. (The *module* does gate it — see ccf-128.test.ts.)
    const eventId = await seedEvent({}, true)
    const group = await db.breakoutGroup.create({
      data: { eventId, name: "Group A" },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222" },
      null
    )
    expect(res.success).toBe(true)

    const placements = await db.breakoutGroupMember.findMany({
      select: { breakoutGroupId: true },
    })
    expect(placements).toEqual([{ breakoutGroupId: group.id }])
  })
})
