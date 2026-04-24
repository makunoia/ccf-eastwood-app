import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  createRegistrant,
  lookupMemberForRegistration,
  walkInCheckin,
} from "@/app/(dashboard)/events/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Guest", "Member", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(overrides: { type?: "OneTime" | "MultiDay" | "Recurring" } = {}) {
  return db.event.create({
    data: {
      name: "Test Event",
      type: overrides.type ?? "OneTime",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-01"),
    },
    select: { id: true },
  })
}

async function seedMember(overrides: {
  phone?: string
  email?: string
  lastName?: string
  birthMonth?: number
  birthYear?: number
} = {}) {
  return db.member.create({
    data: {
      firstName: "Alice",
      lastName: overrides.lastName ?? "Smith",
      phone: overrides.phone,
      email: overrides.email,
      birthMonth: overrides.birthMonth,
      birthYear: overrides.birthYear,
      dateJoined: new Date(),
    },
    select: { id: true },
  })
}

// ─── lookupMemberForRegistration ─────────────────────────────────────────────

describe("lookupMemberForRegistration", () => {
  it("returns null when no member exists", async () => {
    const result = await lookupMemberForRegistration({ mobileNumber: "09170000000" })
    expect(result).toBeNull()
  })

  it("matches by mobile number (exact)", async () => {
    const member = await seedMember({ phone: "09171234567" })
    const result = await lookupMemberForRegistration({ mobileNumber: "09171234567" })
    expect(result?.id).toBe(member.id)
    expect(result?.matchedBy).toBe("mobile")
  })

  it("matches by email when mobile is absent", async () => {
    const member = await seedMember({ email: "alice@example.com" })
    const result = await lookupMemberForRegistration({ email: "alice@example.com" })
    expect(result?.id).toBe(member.id)
    expect(result?.matchedBy).toBe("email")
  })

  it("matches by last name + birthday when mobile and email are absent", async () => {
    const member = await seedMember({
      lastName: "Reyes",
      birthMonth: 3,
      birthYear: 1990,
    })
    const result = await lookupMemberForRegistration({
      lastName: "Reyes",
      birthMonth: 3,
      birthYear: 1990,
    })
    expect(result?.id).toBe(member.id)
    expect(result?.matchedBy).toBe("nameBirthday")
  })

  it("mobile lookup takes priority over email", async () => {
    const byPhone = await seedMember({ phone: "09170000001", email: "phone@example.com" })
    await seedMember({ phone: "09170000002", email: "email@example.com" })

    const result = await lookupMemberForRegistration({
      mobileNumber: "09170000001",
      email: "email@example.com",
    })
    expect(result?.id).toBe(byPhone.id)
    expect(result?.matchedBy).toBe("mobile")
  })
})

// ─── createRegistrant ────────────────────────────────────────────────────────

describe("createRegistrant", () => {
  const BASE_RAW = {
    firstName: "Jane",
    lastName: "Doe",
    nickname: null,
    email: null,
    mobileNumber: "09179999999",
    birthMonth: null,
    birthYear: null,
    lifeStageId: null,
    gender: null,
    language: [] as string[],
    meetingPreference: null,
    workCity: null,
    scheduleDayOfWeek: null,
    scheduleTimeStart: null,
  }

  it("links to confirmed member when confirmedMemberId is provided", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const result = await createRegistrant(event.id, BASE_RAW, member.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const registrant = await db.eventRegistrant.findUnique({ where: { id: result.data.id } })
    expect(registrant?.memberId).toBe(member.id)
    expect(registrant?.guestId).toBeNull()
  })

  it("creates a new guest and links via guestId when confirmedMemberId is null", async () => {
    const event = await seedEvent()

    const result = await createRegistrant(event.id, BASE_RAW, null)
    expect(result.success).toBe(true)
    if (!result.success) return

    const registrant = await db.eventRegistrant.findUnique({ where: { id: result.data.id } })
    expect(registrant?.guestId).not.toBeNull()
    expect(registrant?.memberId).toBeNull()

    const guest = await db.guest.findUnique({ where: { id: registrant!.guestId! } })
    expect(guest?.firstName).toBe("Jane")
    expect(guest?.phone).toBe("09179999999")
  })

  it("reuses an existing guest when mobile number matches", async () => {
    const event = await seedEvent()
    const existingGuest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", phone: "09179999999", language: [] },
      select: { id: true },
    })

    const result = await createRegistrant(event.id, BASE_RAW, null)
    expect(result.success).toBe(true)
    if (!result.success) return

    const registrant = await db.eventRegistrant.findUnique({ where: { id: result.data.id } })
    expect(registrant?.guestId).toBe(existingGuest.id)

    // No duplicate guest should have been created
    const guestCount = await db.guest.count({ where: { phone: "09179999999" } })
    expect(guestCount).toBe(1)
  })

  it("returns a validation error for missing firstName", async () => {
    const event = await seedEvent()
    const result = await createRegistrant(event.id, { ...BASE_RAW, firstName: "" }, null)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("First name is required")
  })
})

// ─── walkInCheckin ────────────────────────────────────────────────────────────

describe("walkInCheckin", () => {
  const BASE_WALKIN = {
    firstName: "Walk",
    lastName: "In",
    nickname: null,
    email: null,
    mobileNumber: "09180000001",
  }

  it("creates a guest registrant and marks attendedAt for a OneTime event", async () => {
    const event = await seedEvent({ type: "OneTime" })

    const result = await walkInCheckin(event.id, BASE_WALKIN, null)
    expect(result.success).toBe(true)
    if (!result.success) return

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: result.data.registrantId },
    })
    expect(registrant?.attendedAt).not.toBeNull()
    expect(registrant?.guestId).not.toBeNull()
  })

  it("creates an OccurrenceAttendee record for an occurrence-based event", async () => {
    const event = await seedEvent({ type: "Recurring" })
    const occurrence = await db.eventOccurrence.create({
      data: {
        eventId: event.id,
        date: new Date("2025-06-01"),
        isOpen: true,
      },
      select: { id: true },
    })

    const result = await walkInCheckin(event.id, BASE_WALKIN, occurrence.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const attendance = await db.occurrenceAttendee.findFirst({
      where: { occurrenceId: occurrence.id, registrantId: result.data.registrantId },
    })
    expect(attendance).not.toBeNull()
  })

  it("reuses an existing member registrant when phone matches a member", async () => {
    const event = await seedEvent({ type: "OneTime" })
    const member = await seedMember({ phone: "09180000001" })

    const result = await walkInCheckin(event.id, BASE_WALKIN, null)
    expect(result.success).toBe(true)
    if (!result.success) return

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: result.data.registrantId },
    })
    expect(registrant?.memberId).toBe(member.id)
    expect(registrant?.guestId).toBeNull()
  })

  it("uses the same registrant on a second walk-in for the same person", async () => {
    const event = await seedEvent({ type: "OneTime" })
    const occurrence1 = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2025-06-01"), isOpen: true },
      select: { id: true },
    })
    const occurrence2 = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2025-06-08"), isOpen: true },
      select: { id: true },
    })

    const first = await walkInCheckin(event.id, BASE_WALKIN, occurrence1.id)
    const second = await walkInCheckin(event.id, BASE_WALKIN, occurrence2.id)
    expect(first.success && second.success).toBe(true)
    if (!first.success || !second.success) return

    expect(first.data.registrantId).toBe(second.data.registrantId)
  })

  it("returns a validation error for missing mobileNumber", async () => {
    const event = await seedEvent()
    const result = await walkInCheckin(event.id, { ...BASE_WALKIN, mobileNumber: "" }, null)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Mobile number is required")
  })
})
