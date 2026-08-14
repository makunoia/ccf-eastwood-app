/**
 * CCF-147 — submitting a reviewed profile.
 *
 * Two rules meet here and the tests exist to keep them from eating each other:
 *
 *  - A field the person **edited** on the review screen overwrites what we hold.
 *  - A field they merely **looked at** keeps fill-if-empty, so a registration
 *    desk can't quietly clobber curated data.
 *
 * The "no touched fields" cases are the regression guard: with the argument
 * omitted, every path has to behave exactly as it did before this change.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "Event", "EventRegistrant", "EventFormConfig", "SchedulePreference", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const MOBILE = "+63 917 123 4567"

/**
 * A bare form collects neither work city nor schedule, and the submit-side config
 * enforcement strips both from the payload before any resolver sees them. These
 * tests are about the *merge* rule, so the event has to actually ask for the
 * fields being merged.
 */
async function seedEvent() {
  const event = await db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
  })
  await db.eventFormConfig.create({
    data: {
      eventId: event.id,
      context: "Register",
      fieldWorkCity: true,
      fieldSchedule: true,
      sectionSmallGroup: true,
    },
  })
  return event
}

async function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      email: "maria@example.com",
      phone: MOBILE,
      workCity: "Ortigas",
      birthMonth: 4,
      birthYear: 1992,
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
  })
}

async function seedGuest(overrides: Record<string, unknown> = {}) {
  return db.guest.create({
    data: {
      firstName: "Juan",
      lastName: "dela Cruz",
      phone: MOBILE,
      workCity: "Ortigas",
      language: [],
      ...overrides,
    },
  })
}

/** The payload the review screen submits — the profile as prefilled, plus edits. */
const reviewedPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Maria",
  lastName: "Santos",
  email: "maria@example.com",
  mobileNumber: MOBILE,
  workCity: "Ortigas",
  ...overrides,
})

describe("submitting a reviewed profile", () => {
  it("links one registrant to the existing member and creates no duplicate guest", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const result = await createRegistrant(event.id, reviewedPayload(), member.id)

    expect(result.success).toBe(true)
    const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
    expect(registrants).toHaveLength(1)
    expect(registrants[0].memberId).toBe(member.id)
    expect(registrants[0].guestId).toBeNull()
    expect(await db.guest.count()).toBe(0)
    expect(await db.member.count()).toBe(1)
  })

  it("persists a field the person edited", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const result = await createRegistrant(
      event.id,
      reviewedPayload({ workCity: "Makati" }),
      member.id,
      null, undefined, null, undefined,
      ["workCity"]
    )

    expect(result.success).toBe(true)
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.workCity).toBe("Makati")
  })

  it("leaves a populated field alone when it wasn't edited", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    // A crafted or stale payload carrying a different value must not win on a
    // field nobody touched — this is the rule the whole design protects.
    await createRegistrant(event.id, reviewedPayload({ workCity: "Makati" }), member.id)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.workCity).toBe("Ortigas")
  })

  it("still fills an empty field without being told it was edited", async () => {
    const event = await seedEvent()
    const member = await seedMember({ workCity: null })

    await createRegistrant(event.id, reviewedPayload({ workCity: "Makati" }), member.id)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.workCity).toBe("Makati")
  })

  it("refuses to clear a stored value, even on an edited field", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    await createRegistrant(
      event.id, reviewedPayload({ workCity: "" }), member.id,
      null, undefined, null, undefined, ["workCity"]
    )

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.workCity).toBe("Ortigas")
  })

  it("applies the same rules to a confirmed guest", async () => {
    const event = await seedEvent()
    const guest = await seedGuest()

    await createRegistrant(
      event.id,
      { firstName: "Juan", lastName: "dela Cruz", mobileNumber: MOBILE, workCity: "Makati" },
      null, guest.id, undefined, null, undefined,
      ["workCity"]
    )

    const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(after.workCity).toBe("Makati")
    expect(await db.guest.count()).toBe(1)
  })
})

describe("editing a contact identifier", () => {
  it("refuses a mobile number that already belongs to another member", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await seedMember({
      firstName: "Ana", lastName: "Reyes",
      email: "ana@example.com", phone: "+63 918 222 3333",
    })

    const result = await createRegistrant(
      event.id,
      reviewedPayload({ mobileNumber: "+63 918 222 3333" }),
      member.id,
      null, undefined, null, undefined,
      ["mobileNumber"]
    )

    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected a refusal")
    expect(result.error).toContain("already belongs to another profile")
    // Nothing was written and nobody was registered.
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.phone).toBe(MOBILE)
    expect(await db.eventRegistrant.count()).toBe(0)
  })

  it("refuses an email that already belongs to another member", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await seedMember({
      firstName: "Ana", lastName: "Reyes",
      email: "ana@example.com", phone: "+63 918 222 3333",
    })

    const result = await createRegistrant(
      event.id,
      reviewedPayload({ email: "ana@example.com" }),
      member.id,
      null, undefined, null, undefined,
      ["email"]
    )

    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected a refusal")
    expect(result.error).toContain("already belongs to another profile")
  })

  it("accepts a mobile number nobody else holds", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const result = await createRegistrant(
      event.id,
      reviewedPayload({ mobileNumber: "0919 555 6666" }),
      member.id,
      null, undefined, null, undefined,
      ["mobileNumber"]
    )

    expect(result.success).toBe(true)
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    // Stored canonical, whatever format was typed.
    expect(after.phone).toBe("+63 919 555 6666")
  })

  it("does not block a member and an active guest sharing a number", async () => {
    const event = await seedEvent()
    const member = await seedMember({ phone: "+63 918 222 3333" })
    await seedGuest()

    const result = await createRegistrant(
      event.id, reviewedPayload({ mobileNumber: MOBILE }), member.id,
      null, undefined, null, undefined, ["mobileNumber"]
    )

    // Cross-model duplicates are an ordinary situation the lookup resolves by
    // preferring the Member; refusing them would reject real registrations.
    expect(result.success).toBe(true)
  })
})

describe("schedule edits", () => {
  it("replaces a member's availability rather than adding a second slot", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.schedulePreference.create({
      data: { memberId: member.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
    })

    await createRegistrant(
      event.id,
      reviewedPayload({ scheduleDayOfWeek: 6, scheduleTimeStart: "09:00", scheduleTimeEnd: "11:00" }),
      member.id,
      null, undefined, null, undefined,
      ["scheduleDayOfWeek"]
    )

    const slots = await db.schedulePreference.findMany({ where: { memberId: member.id } })
    expect(slots).toHaveLength(1)
    expect(slots[0].dayOfWeek).toBe(6)
    expect(slots[0].timeStart).toBe("09:00")
  })

  it("leaves a member's stored availability alone when it wasn't edited", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.schedulePreference.create({
      data: { memberId: member.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
    })

    await createRegistrant(
      event.id,
      reviewedPayload({ scheduleDayOfWeek: 6, scheduleTimeStart: "09:00" }),
      member.id
    )

    const slots = await db.schedulePreference.findMany({ where: { memberId: member.id } })
    expect(slots).toHaveLength(1)
    expect(slots[0].dayOfWeek).toBe(2)
  })

  it("carries a guest's window with the day it belongs to, clearing a stale time", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({
      scheduleDayOfWeek: 2, scheduleTimeStart: "19:00", scheduleTimeEnd: "21:00",
    })

    await createRegistrant(
      event.id,
      { firstName: "Juan", lastName: "dela Cruz", mobileNumber: MOBILE, scheduleDayOfWeek: 6 },
      null, guest.id, undefined, null, undefined,
      ["scheduleDayOfWeek"]
    )

    const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(after.scheduleDayOfWeek).toBe(6)
    // Leaving 19:00–21:00 attached to a newly-chosen Saturday would describe a
    // slot the person never picked.
    expect(after.scheduleTimeStart).toBeNull()
    expect(after.scheduleTimeEnd).toBeNull()
  })

  it("treats Sunday as a real answer, not a blank", async () => {
    const event = await seedEvent()
    const guest = await seedGuest()

    await createRegistrant(
      event.id,
      { firstName: "Juan", lastName: "dela Cruz", mobileNumber: MOBILE, scheduleDayOfWeek: 0 },
      null, guest.id
    )

    const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(after.scheduleDayOfWeek).toBe(0)
  })
})

describe("rejecting the match", () => {
  it("creates a fresh guest instead of re-matching the rejected record", async () => {
    const event = await seedEvent()
    const rejected = await seedGuest()

    // What the form sends after "No, not me": no confirmed id, and dedup off, so
    // the phone/email/name ladder can't put them straight back.
    const result = await createRegistrant(
      event.id,
      { firstName: "Josefa", lastName: "Ramos", mobileNumber: MOBILE },
      null, null, true
    )

    expect(result.success).toBe(true)
    const guests = await db.guest.findMany({ orderBy: { createdAt: "asc" } })
    expect(guests).toHaveLength(2)
    const fresh = guests.find((g) => g.id !== rejected.id)
    expect(fresh?.firstName).toBe("Josefa")

    const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
    expect(registrants).toHaveLength(1)
    expect(registrants[0].guestId).toBe(fresh?.id)
  })

  it("still dedups normally when nothing was rejected", async () => {
    const event = await seedEvent()
    const guest = await seedGuest()

    await createRegistrant(
      event.id,
      { firstName: "Juan", lastName: "dela Cruz", mobileNumber: MOBILE },
      null
    )

    expect(await db.guest.count()).toBe(1)
    const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
    expect(registrants[0].guestId).toBe(guest.id)
  })
})
