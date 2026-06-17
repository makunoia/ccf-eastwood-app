import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  lookupCheckinRegistrant,
  lookupCheckinRegistrantByProfile,
  markCheckinAttendance,
  checkInToOccurrence,
} from "@/app/(dashboard)/events/actions"

// Volunteers check in through the same check-in page as registrants, but are a distinct
// subject — never a registrant. Attendance is recorded on Volunteer.attendedAt (OneTime)
// or an OccurrenceAttendee with volunteerId set (sessions).

const PHONE_CANONICAL = "+63 917 123 4567"

async function seedEvent(type: "OneTime" | "Recurring" = "OneTime") {
  return db.event.create({
    data: { name: "Test Event", type, startDate: new Date(), endDate: new Date() },
  })
}

async function seedVolunteer(
  eventId: string,
  member: { firstName?: string; lastName: string; phone?: string | null; email?: string | null; birthMonth?: number | null; birthYear?: number | null }
) {
  const m = await db.member.create({
    data: {
      firstName: member.firstName ?? "Vol",
      lastName: member.lastName,
      phone: member.phone ?? null,
      email: member.email ?? null,
      birthMonth: member.birthMonth ?? null,
      birthYear: member.birthYear ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Logistics", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Usher", committeeId: committee.id },
  })
  return db.volunteer.create({
    data: {
      memberId: m.id,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("volunteer check-in", () => {
  describe("session (Recurring/MultiDay) attendance", () => {
    it("looks up a volunteer by member phone and records OccurrenceAttendee with volunteerId", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      const volunteer = await seedVolunteer(event.id, { lastName: "Cruz", phone: PHONE_CANONICAL })

      const lookup = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, occurrence.id)
      expect(lookup.success).toBe(true)
      if (!lookup.success || !lookup.data || "matchType" in lookup.data) throw new Error("expected single match")
      expect(lookup.data.kind).toBe("volunteer")
      expect(lookup.data.subjectId).toBe(volunteer.id)
      expect(lookup.data.alreadyCheckedIn).toBe(false)
      expect(lookup.data.guestSmallGroupPrompt).toBeNull()

      const result = await checkInToOccurrence(occurrence.id, { kind: "volunteer", id: volunteer.id })
      expect(result.success).toBe(true)

      const rows = await db.occurrenceAttendee.findMany({ where: { occurrenceId: occurrence.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0].volunteerId).toBe(volunteer.id)
      expect(rows[0].registrantId).toBeNull()
    })

    it("is idempotent and reports alreadyCheckedIn on a second lookup", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      const volunteer = await seedVolunteer(event.id, { lastName: "Cruz", phone: PHONE_CANONICAL })

      await checkInToOccurrence(occurrence.id, { kind: "volunteer", id: volunteer.id })
      await checkInToOccurrence(occurrence.id, { kind: "volunteer", id: volunteer.id })

      const rows = await db.occurrenceAttendee.findMany({ where: { occurrenceId: occurrence.id } })
      expect(rows).toHaveLength(1)

      const lookup = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, occurrence.id)
      if (!lookup.success || !lookup.data || "matchType" in lookup.data) throw new Error("expected single match")
      expect(lookup.data.alreadyCheckedIn).toBe(true)
    })
  })

  describe("OneTime attendance", () => {
    it("marks Volunteer.attendedAt and reports alreadyCheckedIn afterwards", async () => {
      const event = await seedEvent("OneTime")
      const volunteer = await seedVolunteer(event.id, { lastName: "Reyes", phone: PHONE_CANONICAL })

      const before = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, null)
      if (!before.success || !before.data || "matchType" in before.data) throw new Error("expected single match")
      expect(before.data.kind).toBe("volunteer")
      expect(before.data.alreadyCheckedIn).toBe(false)

      const result = await markCheckinAttendance({ kind: "volunteer", id: volunteer.id })
      expect(result.success).toBe(true)

      const updated = await db.volunteer.findUnique({ where: { id: volunteer.id } })
      expect(updated?.attendedAt).not.toBeNull()

      const after = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, null)
      if (!after.success || !after.data || "matchType" in after.data) throw new Error("expected single match")
      expect(after.data.alreadyCheckedIn).toBe(true)
    })
  })

  describe("lookup by name + DOB", () => {
    it("matches a volunteer via member last name and birthday", async () => {
      const event = await seedEvent("OneTime")
      const volunteer = await seedVolunteer(event.id, {
        firstName: "Ana",
        lastName: "Santos",
        birthMonth: 4,
        birthYear: 1991,
      })

      const lookup = await lookupCheckinRegistrantByProfile(event.id, "Santos", 4, 1991, null)
      if (!lookup.success || !lookup.data || "matchType" in lookup.data) throw new Error("expected single match")
      expect(lookup.data.kind).toBe("volunteer")
      expect(lookup.data.subjectId).toBe(volunteer.id)
      expect(lookup.data.name).toBe("Ana Santos")
    })
  })

  describe("registrant + volunteer sharing a phone", () => {
    it("prefers the volunteer record without forcing disambiguation", async () => {
      const event = await seedEvent("OneTime")
      const guest = await db.guest.create({
        data: { firstName: "Jose", lastName: "Garcia", phone: PHONE_CANONICAL, language: [] },
      })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
      const volunteer = await seedVolunteer(event.id, { lastName: "Lim", phone: PHONE_CANONICAL })

      const lookup = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, null)
      // A volunteer match suppresses the stray registrant match — single, non-ambiguous result.
      if (!lookup.success || !lookup.data || "matchType" in lookup.data) throw new Error("expected single match")
      expect(lookup.data.kind).toBe("volunteer")
      expect(lookup.data.subjectId).toBe(volunteer.id)
    })

    it("still disambiguates between two registrants when no volunteer matches", async () => {
      const event = await seedEvent("OneTime")
      const g1 = await db.guest.create({
        data: { firstName: "Ana", lastName: "Lopez", phone: PHONE_CANONICAL, language: [] },
      })
      const g2 = await db.guest.create({
        data: { firstName: "Ben", lastName: "Lopez", phone: PHONE_CANONICAL, language: [] },
      })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g2.id } })

      const lookup = await lookupCheckinRegistrant(event.id, PHONE_CANONICAL, null)
      if (!lookup.success || !lookup.data || !("matchType" in lookup.data)) throw new Error("expected ambiguous match")
      expect(lookup.data.candidates).toHaveLength(2)
      expect(lookup.data.candidates.every((c) => c.kind === "registrant")).toBe(true)
    })
  })

  describe("attendance counting (tracked but separate)", () => {
    it("excludes a checked-in volunteer from the participant-attendance query", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      // One participant + one volunteer both check in.
      const guest = await db.guest.create({ data: { firstName: "Pia", lastName: "Tan", language: [] } })
      const registrant = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
      await checkInToOccurrence(occurrence.id, { kind: "registrant", id: registrant.id })

      const volunteer = await seedVolunteer(event.id, { lastName: "Cruz", phone: PHONE_CANONICAL })
      await checkInToOccurrence(occurrence.id, { kind: "volunteer", id: volunteer.id })

      const totalCheckedIn = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
      expect(totalCheckedIn).toBe(2)

      // Mirrors the dashboard / sessions participant-attendance query.
      const participants = await db.occurrenceAttendee.count({
        where: { occurrenceId: occurrence.id, registrantId: { not: null } },
      })
      expect(participants).toBe(1)

      const volunteersPresent = await db.occurrenceAttendee.count({
        where: { occurrenceId: occurrence.id, volunteerId: { not: null } },
      })
      expect(volunteersPresent).toBe(1)
    })
  })
})
