import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  checkSessionAttendanceDuplicates,
  importSessionAttendance,
} from "@/app/(event)/event/[id]/sessions/[occurrenceId]/import-actions"

afterAll(async () => {
  await db.$disconnect()
})

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "EventRegistrant",
    "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "Event", "Guest", "SchedulePreference", "Member"
    RESTART IDENTITY CASCADE`
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedRecurringEvent() {
  const event = await db.event.create({
    data: { name: "Sunday Service", type: "Recurring", startDate: new Date("2026-01-05"), endDate: new Date("2026-06-29") },
    select: { id: true },
  })
  const occurrence = await db.eventOccurrence.create({
    data: { eventId: event.id, date: new Date("2026-01-05T00:00:00Z"), isOpen: true },
    select: { id: true, date: true, eventId: true },
  })
  return { event, occurrence }
}

async function seedMember(overrides: { phone?: string; email?: string } = {}) {
  return db.member.create({
    data: {
      firstName: "Juan",
      lastName: "Cruz",
      dateJoined: new Date(),
      language: [],
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
    },
    select: { id: true, phone: true, email: true },
  })
}

async function seedGuest(overrides: { phone?: string; email?: string } = {}) {
  return db.guest.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      language: [],
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
    },
    select: { id: true, phone: true, email: true },
  })
}

async function seedRegistrant(eventId: string, options: { memberId?: string; guestId?: string } = {}) {
  return db.eventRegistrant.create({
    data: { eventId, memberId: options.memberId ?? null, guestId: options.guestId ?? null },
    select: { id: true },
  })
}

async function seedEventVolunteer(eventId: string, memberId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Logistics", eventId },
    select: { id: true },
  })
  const role = await db.committeeRole.create({
    data: { name: "Usher", committeeId: committee.id },
    select: { id: true },
  })
  return db.volunteer.create({
    data: {
      memberId,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
    select: { id: true },
  })
}

async function seedOccurrenceAttendee(occurrenceId: string, registrantId: string) {
  return db.occurrenceAttendee.create({
    data: { occurrenceId, registrantId, checkedInAt: new Date("2026-01-05T10:00:00Z") },
    select: { id: true },
  })
}

// ─── checkSessionAttendanceDuplicates ─────────────────────────────────────────

describe("checkSessionAttendanceDuplicates", () => {
  it("returns empty when no one is already checked in", async () => {
    const { occurrence } = await seedRecurringEvent()
    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { phone: "09171234567" },
      { email: "someone@example.com" },
    ])
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })

  it("returns a match for a Member who already has OccurrenceAttendee (by phone)", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const member = await seedMember({ phone: "+63 917 123 4567" })
    const registrant = await seedRegistrant(event.id, { memberId: member.id })
    await seedOccurrenceAttendee(occurrence.id, registrant.id)

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { phone: "09171234567" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].rowIndex).toBe(0)
      expect(result.data[0].existingId).toBe(registrant.id)
    }
  })

  it("matches already-attended rows when the stored phone is unformatted", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const member = await seedMember({ phone: "09171234567" })
    const registrant = await seedRegistrant(event.id, { memberId: member.id })
    await seedOccurrenceAttendee(occurrence.id, registrant.id)

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { phone: "+63 917 123 4567" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].existingId).toBe(registrant.id)
    }
  })

  it("returns a match for a Guest who already has OccurrenceAttendee (by email)", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const guest = await seedGuest({ email: "maria@example.com" })
    const registrant = await seedRegistrant(event.id, { guestId: guest.id })
    await seedOccurrenceAttendee(occurrence.id, registrant.id)

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { email: "maria@example.com" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].rowIndex).toBe(0)
      expect(result.data[0].existingName).toContain("Maria")
    }
  })

  it("returns a recognized match for a Guest who exists in the DB but has NOT attended this occurrence", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const guest = await seedGuest({ email: "pending@example.com" })
    await seedRegistrant(event.id, { guestId: guest.id })
    // No OccurrenceAttendee created

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { email: "pending@example.com" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].kind).toBe("recognized")
      expect(result.data[0].existingId).toBe(guest.id)
      expect(result.data[0].existingType).toBe("guest")
    }
  })

  it("returns a recognized match for a Guest found by phone (not email)", async () => {
    const { occurrence } = await seedRecurringEvent()
    await seedGuest({ phone: "+63 917 123 4567" })

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { phone: "09171234567" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].kind).toBe("recognized")
      expect(result.data[0].existingType).toBe("guest")
    }
  })

  it("returns a recognized match for a Member found by phone", async () => {
    const { occurrence } = await seedRecurringEvent()
    const member = await seedMember({ phone: "+63 917 123 4567" })

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { phone: "09171234567" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].kind).toBe("recognized")
      expect(result.data[0].existingId).toBe(member.id)
      expect(result.data[0].existingType).toBe("member")
    }
  })

  it("prefers already-attended (true duplicate) over recognized for the same person", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const guest = await seedGuest({ email: "attended@example.com" })
    const registrant = await seedRegistrant(event.id, { guestId: guest.id })
    await seedOccurrenceAttendee(occurrence.id, registrant.id)

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { email: "attended@example.com" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      // Must be a true duplicate (no kind), not recognized
      expect(result.data[0].kind).toBeUndefined()
      expect(result.data[0].existingId).toBe(registrant.id)
    }
  })

  it("returns error when occurrence does not exist", async () => {
    const result = await checkSessionAttendanceDuplicates("nonexistent-id", [])
    expect(result.success).toBe(false)
  })

  it("handles mixed rows — already-attended and recognized and truly new", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const attendedGuest = await seedGuest({ email: "checked-in@example.com" })
    const registrant = await seedRegistrant(event.id, { guestId: attendedGuest.id })
    await seedOccurrenceAttendee(occurrence.id, registrant.id)
    // Existing guest not yet checked in
    await seedGuest({ email: "existing@example.com" })

    const result = await checkSessionAttendanceDuplicates(occurrence.id, [
      { email: "checked-in@example.com" },   // already attended → true duplicate
      { email: "existing@example.com" },      // in DB but not attended → recognized
      { email: "new-person@example.com" },    // not in DB → no match
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      const byEmail = Object.fromEntries(result.data.map((d) => [d.existingEmail, d]))
      expect(byEmail["checked-in@example.com"].kind).toBeUndefined()
      expect(byEmail["existing@example.com"].kind).toBe("recognized")
    }
  })
})

// ─── importSessionAttendance ──────────────────────────────────────────────────

describe("importSessionAttendance", () => {
  it("returns error when occurrence does not exist", async () => {
    const result = await importSessionAttendance("nonexistent-id", [])
    expect(result.success).toBe(false)
  })

  it("skips rows flagged as existingId (already attended)", async () => {
    const { occurrence } = await seedRecurringEvent()
    const result = await importSessionAttendance(occurrence.id, [
      {
        mapped: { firstName: "Maria", lastName: "Santos" },
        resolution: "use-existing",
        existingId: "some-registrant-id",
      },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.skipped).toBe(1)
      expect(result.data.created).toBe(0)
      expect(result.data.linked).toBe(0)
    }
  })

  it("adds error and skips rows missing firstName or lastName", async () => {
    const { occurrence } = await seedRecurringEvent()
    const result = await importSessionAttendance(occurrence.id, [
      { mapped: { firstName: "", lastName: "Santos" }, resolution: "use-existing" },
      { mapped: { firstName: "Maria", lastName: "" }, resolution: "use-existing" },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.errors).toHaveLength(2)
      expect(result.data.skipped).toBe(2)
    }
  })

  describe("walk-in — no existing Member or Guest", () => {
    it("creates Guest, EventRegistrant, and OccurrenceAttendee", async () => {
      const { occurrence } = await seedRecurringEvent()
      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Pedro", lastName: "Reyes", mobileNumber: "09191234567" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.created).toBe(1)
        expect(result.data.linked).toBe(0)
        expect(result.data.errors).toHaveLength(0)
      }

      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee).not.toBeNull()

      const registrant = await db.eventRegistrant.findUnique({ where: { id: attendee!.registrantId! } })
      expect(registrant?.guestId).toBeTruthy()

      const guest = await db.guest.findUnique({ where: { id: registrant!.guestId! } })
      expect(guest?.firstName).toBe("Pedro")
      expect(guest?.lastName).toBe("Reyes")
    })

    it("defaults checkedInAt to occurrence date when not provided", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Ana", lastName: "Lim" }, resolution: "use-existing" },
      ])
      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.checkedInAt.toISOString()).toBe(new Date("2026-01-05T00:00:00Z").toISOString())
    })

    it("parses time-only checkedInAt string relative to occurrence date", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Ana", lastName: "Lim", checkedInAt: "10:30" }, resolution: "use-existing" },
      ])
      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.checkedInAt.getUTCHours()).toBe(10)
      expect(attendee?.checkedInAt.getUTCMinutes()).toBe(30)
    })

    it("parses AM/PM time-only checkedInAt string", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Ana", lastName: "Lim", checkedInAt: "2:30 PM" }, resolution: "use-existing" },
      ])
      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.checkedInAt.getUTCHours()).toBe(14)
      expect(attendee?.checkedInAt.getUTCMinutes()).toBe(30)
    })

    it("extracts the time from a datetime string and applies it to the occurrence date", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        {
          mapped: { firstName: "Ana", lastName: "Lim", checkedInAt: "2026-02-09 2:30 PM" },
          resolution: "use-existing",
        },
      ])
      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.checkedInAt.toISOString()).toBe(new Date("2026-01-05T14:30:00.000Z").toISOString())
    })
  })

  describe("existing Guest already registered for this event", () => {
    it("creates only OccurrenceAttendee (linked, not created)", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const guest = await seedGuest({ email: "maria@example.com" })
      const registrant = await seedRegistrant(event.id, { guestId: guest.id })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Maria", lastName: "Santos", email: "maria@example.com" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const attendee = await db.occurrenceAttendee.findUnique({
        where: { occurrenceId_registrantId: { occurrenceId: occurrence.id, registrantId: registrant.id } },
      })
      expect(attendee).not.toBeNull()

      // No new EventRegistrant should have been created
      const allRegistrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(allRegistrants).toHaveLength(1)
    })
  })

  describe("existing Guest NOT yet registered for this event", () => {
    it("creates EventRegistrant and OccurrenceAttendee (walk-in link) — by email", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const guest = await seedGuest({ email: "unregistered@example.com" })
      // No EventRegistrant

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Maria", lastName: "Santos", email: "unregistered@example.com" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const registrant = await db.eventRegistrant.findFirst({ where: { eventId: event.id, guestId: guest.id } })
      expect(registrant).not.toBeNull()

      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.registrantId).toBe(registrant!.id)
    })

    it("creates EventRegistrant and OccurrenceAttendee (walk-in link) — by phone", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const guest = await seedGuest({ phone: "+63 917 123 4567" })
      // No EventRegistrant

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Maria", lastName: "Santos", mobileNumber: "09171234567" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const registrant = await db.eventRegistrant.findFirst({ where: { eventId: event.id, guestId: guest.id } })
      expect(registrant).not.toBeNull()

      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.registrantId).toBe(registrant!.id)
    })

    it("does not create a duplicate Guest when phone format differs from stored canonical", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      await seedGuest({ phone: "+63 917 123 4567" })

      await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Maria", lastName: "Santos", mobileNumber: "09171234567" }, resolution: "use-existing" },
      ])

      const allGuests = await db.guest.findMany({ where: { phone: { in: ["+63 917 123 4567", "09171234567"] } } })
      expect(allGuests).toHaveLength(1)

      const allRegistrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(allRegistrants).toHaveLength(1)
    })
  })

  describe("existing Member already registered for this event", () => {
    it("creates only OccurrenceAttendee (linked)", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ phone: "+63 917 123 4567" })
      const registrant = await seedRegistrant(event.id, { memberId: member.id })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Juan", lastName: "Cruz", mobileNumber: "09171234567" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const attendee = await db.occurrenceAttendee.findUnique({
        where: { occurrenceId_registrantId: { occurrenceId: occurrence.id, registrantId: registrant.id } },
      })
      expect(attendee).not.toBeNull()
    })

    it("matches an existing member even when the stored phone is unformatted", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ phone: "09171234567" })
      const registrant = await seedRegistrant(event.id, { memberId: member.id })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Juan", lastName: "Cruz", mobileNumber: "+63 917 123 4567" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const attendee = await db.occurrenceAttendee.findUnique({
        where: { occurrenceId_registrantId: { occurrenceId: occurrence.id, registrantId: registrant.id } },
      })
      expect(attendee).not.toBeNull()
    })
  })

  describe("existing Member NOT yet registered for this event", () => {
    it("creates EventRegistrant and OccurrenceAttendee (member walk-in)", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ email: "juan@example.com" })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Juan", lastName: "Cruz", email: "juan@example.com" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const registrant = await db.eventRegistrant.findFirst({ where: { eventId: event.id, memberId: member.id } })
      expect(registrant).not.toBeNull()

      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.registrantId).toBe(registrant!.id)
    })
  })

  describe("already attended — OccurrenceAttendee already exists", () => {
    it("skips and increments skipped count (idempotent)", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const guest = await seedGuest({ email: "attended@example.com" })
      const registrant = await seedRegistrant(event.id, { guestId: guest.id })
      await seedOccurrenceAttendee(occurrence.id, registrant.id)

      const before = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Maria", lastName: "Santos", email: "attended@example.com" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.skipped).toBe(1)
        expect(result.data.created).toBe(0)
        expect(result.data.linked).toBe(0)
      }

      const after = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
      expect(after).toBe(before)
    })
  })

  describe("matched Member is a volunteer for this event", () => {
    it("records volunteer attendance (volunteerId, not registrantId)", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ phone: "+63 917 123 4567" })
      const volunteer = await seedEventVolunteer(event.id, member.id)

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Juan", lastName: "Cruz", mobileNumber: "09171234567" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(0)
      }

      const attendee = await db.occurrenceAttendee.findFirst({ where: { occurrenceId: occurrence.id } })
      expect(attendee?.volunteerId).toBe(volunteer.id)
      expect(attendee?.registrantId).toBeNull()

      // Must NOT create a participant EventRegistrant for a volunteer
      const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(registrants).toHaveLength(0)
    })

    it("heals a re-import: converts mis-filed participant attendance to volunteer attendance and removes the walk-in registrant", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ phone: "+63 917 123 4567" })
      const volunteer = await seedEventVolunteer(event.id, member.id)
      // Simulate the earlier buggy import: a walk-in registrant + participant attendance.
      const walkInReg = await seedRegistrant(event.id, { memberId: member.id })
      await seedOccurrenceAttendee(occurrence.id, walkInReg.id)

      // Re-import the same person — the duplicate check would flag the walk-in as
      // already-attended (existingId = walkInReg.id).
      const result = await importSessionAttendance(occurrence.id, [
        {
          mapped: { firstName: "Juan", lastName: "Cruz", mobileNumber: "09171234567" },
          resolution: "use-existing",
          existingId: walkInReg.id,
        },
      ])
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.linked).toBe(1)

      // Participant attendance gone, single volunteer attendance row remains.
      const attendees = await db.occurrenceAttendee.findMany({ where: { occurrenceId: occurrence.id } })
      expect(attendees).toHaveLength(1)
      expect(attendees[0].volunteerId).toBe(volunteer.id)
      expect(attendees[0].registrantId).toBeNull()

      // The auto-created walk-in registrant was removed.
      const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(registrants).toHaveLength(0)
    })

    it("heals attendance but keeps a registrant that has payment or other-session attendance", async () => {
      const event = await db.event.create({
        data: { name: "Camp", type: "MultiDay", startDate: new Date("2026-01-05"), endDate: new Date("2026-01-06") },
        select: { id: true },
      })
      const day1 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2026-01-05T00:00:00Z"), isOpen: true },
        select: { id: true },
      })
      const day2 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2026-01-06T00:00:00Z"), isOpen: true },
        select: { id: true },
      })
      const member = await seedMember({ email: "juan@example.com" })
      const volunteer = await seedEventVolunteer(event.id, member.id)
      const reg = await seedRegistrant(event.id, { memberId: member.id })
      // Mis-filed participant attendance on day1, plus a legit attendance on day2.
      await seedOccurrenceAttendee(day1.id, reg.id)
      await seedOccurrenceAttendee(day2.id, reg.id)

      const result = await importSessionAttendance(day1.id, [
        {
          mapped: { firstName: "Juan", lastName: "Cruz", email: "juan@example.com" },
          resolution: "use-existing",
          existingId: reg.id,
        },
      ])
      expect(result.success).toBe(true)

      // Day1 now has a volunteer row; the registrant survives because it still has day2.
      const day1Attendees = await db.occurrenceAttendee.findMany({ where: { occurrenceId: day1.id } })
      expect(day1Attendees).toHaveLength(1)
      expect(day1Attendees[0].volunteerId).toBe(volunteer.id)

      const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(registrants).toHaveLength(1)
      const day2Attendees = await db.occurrenceAttendee.findMany({ where: { occurrenceId: day2.id } })
      expect(day2Attendees).toHaveLength(1)
    })

    it("is idempotent — skips when the volunteer already has attendance for this occurrence", async () => {
      const { event, occurrence } = await seedRecurringEvent()
      const member = await seedMember({ email: "juan@example.com" })
      const volunteer = await seedEventVolunteer(event.id, member.id)
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, volunteerId: volunteer.id },
      })

      const result = await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Juan", lastName: "Cruz", email: "juan@example.com" }, resolution: "use-existing" },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.skipped).toBe(1)
        expect(result.data.linked).toBe(0)
      }

      const count = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
      expect(count).toBe(1)
    })
  })

  describe("mixed batch", () => {
    it("processes walk-in, link, skip, and error in a single import", async () => {
      const { event, occurrence } = await seedRecurringEvent()

      // Already registered + attended → will be skipped
      const attendedGuest = await seedGuest({ email: "attended@example.com" })
      const attendedReg = await seedRegistrant(event.id, { guestId: attendedGuest.id })
      await seedOccurrenceAttendee(occurrence.id, attendedReg.id)

      // Already registered, not yet attended → will be linked
      const registeredGuest = await seedGuest({ email: "registered@example.com" })
      await seedRegistrant(event.id, { guestId: registeredGuest.id })

      const result = await importSessionAttendance(occurrence.id, [
        // Row 0: already attended — skipped by existingId
        {
          mapped: { firstName: "Maria", lastName: "Attended" },
          resolution: "use-existing",
          existingId: attendedReg.id,
        },
        // Row 1: registered guest, not yet attended → linked
        {
          mapped: { firstName: "Pedro", lastName: "Registered", email: "registered@example.com" },
          resolution: "use-existing",
        },
        // Row 2: brand new walk-in → created
        {
          mapped: { firstName: "Ana", lastName: "Walkin" },
          resolution: "use-existing",
        },
        // Row 3: missing last name → error
        {
          mapped: { firstName: "Error", lastName: "" },
          resolution: "use-existing",
        },
      ])

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(4)
        expect(result.data.skipped).toBe(2) // row 0 (existingId) + row 3 (error)
        expect(result.data.linked).toBe(1)
        expect(result.data.created).toBe(1)
        expect(result.data.errors).toHaveLength(1)
      }

      const totalAttendees = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
      // 1 pre-existing + 1 linked + 1 created = 3
      expect(totalAttendees).toBe(3)
    })
  })

  describe("matching profile fields — gender, birth month, birth year", () => {
    it("sets gender, birthMonth, and birthYear on a brand-new Guest walk-in", async () => {
      const { occurrence } = await seedRecurringEvent()
      const result = await importSessionAttendance(occurrence.id, [
        {
          mapped: {
            firstName: "Pedro",
            lastName: "Reyes",
            mobileNumber: "09191234567",
            gender: "Male",
            birthMonth: "March",
            birthYear: "1995",
          },
          resolution: "use-existing",
        },
      ])
      expect(result.success).toBe(true)

      const guest = await db.guest.findFirst({ where: { firstName: "Pedro", lastName: "Reyes" } })
      expect(guest?.gender).toBe("Male")
      expect(guest?.birthMonth).toBe(3)
      expect(guest?.birthYear).toBe(1995)
    })

    it("parses a numeric birth month", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        {
          mapped: { firstName: "Ana", lastName: "Lim", gender: "F", birthMonth: "12" },
          resolution: "use-existing",
        },
      ])
      const guest = await db.guest.findFirst({ where: { firstName: "Ana", lastName: "Lim" } })
      expect(guest?.gender).toBe("Female")
      expect(guest?.birthMonth).toBe(12)
      expect(guest?.birthYear).toBeNull()
    })

    it("ignores an out-of-range birth month", async () => {
      const { occurrence } = await seedRecurringEvent()
      await importSessionAttendance(occurrence.id, [
        { mapped: { firstName: "Ana", lastName: "Lim", birthMonth: "13" }, resolution: "use-existing" },
      ])
      const guest = await db.guest.findFirst({ where: { firstName: "Ana", lastName: "Lim" } })
      expect(guest?.birthMonth).toBeNull()
    })

    it("backfills missing matching fields on an existing Guest without overwriting set ones", async () => {
      const { occurrence } = await seedRecurringEvent()
      const guest = await db.guest.create({
        data: {
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@example.com",
          language: [],
          gender: "Female",
          // birthMonth / birthYear unset
        },
        select: { id: true },
      })

      await importSessionAttendance(occurrence.id, [
        {
          mapped: {
            firstName: "Maria",
            lastName: "Santos",
            email: "maria@example.com",
            gender: "Male", // should NOT overwrite existing Female
            birthMonth: "6",
            birthYear: "1990",
          },
          resolution: "use-existing",
        },
      ])

      const updated = await db.guest.findUnique({ where: { id: guest.id } })
      expect(updated?.gender).toBe("Female") // preserved
      expect(updated?.birthMonth).toBe(6) // backfilled
      expect(updated?.birthYear).toBe(1990) // backfilled
    })

    it("backfills missing matching fields on an existing Member", async () => {
      const { occurrence } = await seedRecurringEvent()
      const member = await seedMember({ email: "juan@example.com" })

      await importSessionAttendance(occurrence.id, [
        {
          mapped: {
            firstName: "Juan",
            lastName: "Cruz",
            email: "juan@example.com",
            gender: "Male",
            birthYear: "1988",
          },
          resolution: "use-existing",
        },
      ])

      const updated = await db.member.findUnique({ where: { id: member.id } })
      expect(updated?.gender).toBe("Male")
      expect(updated?.birthYear).toBe(1988)
    })
  })
})
