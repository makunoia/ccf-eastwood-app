import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { lookupCheckinRegistrantByName } from "@/app/(dashboard)/events/actions"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedEvent(type: "OneTime" | "Recurring" = "OneTime") {
  return db.event.create({
    data: { name: "Test Event", type, startDate: new Date(), endDate: new Date() },
  })
}

async function seedGuest(overrides: {
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
}) {
  return db.guest.create({
    data: {
      firstName: overrides.firstName,
      lastName: overrides.lastName,
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
      language: [],
    },
  })
}

async function seedMember(overrides: {
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
}) {
  return db.member.create({
    data: {
      firstName: overrides.firstName,
      lastName: overrides.lastName,
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

async function seedVolunteer(
  eventId: string,
  member: { firstName: string; lastName: string; phone?: string | null; email?: string | null }
) {
  const m = await seedMember(member)
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

type SingleMatchData = {
  kind: "registrant" | "volunteer"
  subjectId: string
  name: string
  nickname: string | null
  alreadyCheckedIn: boolean
  contactHint: string | null
  guestSmallGroupPrompt: null
}

function isSingleMatch(
  result: Awaited<ReturnType<typeof lookupCheckinRegistrantByName>>
): result is { success: true; data: SingleMatchData } {
  return result.success && result.data !== null && !("matchType" in (result.data as object))
}

function isAmbiguousMatch(
  result: Awaited<ReturnType<typeof lookupCheckinRegistrantByName>>
): result is { success: true; data: { matchType: "ambiguous"; candidates: SingleMatchData[] } } {
  return result.success && result.data !== null && "matchType" in (result.data as object)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ── Integration: core matching ────────────────────────────────────────────────

describe("lookupCheckinRegistrantByName", () => {
  describe("core matching", () => {
    it("returns null when no registrants exist for the event", async () => {
      const event = await seedEvent()
      const result = await lookupCheckinRegistrantByName(event.id, "Juan", "dela Cruz", null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when the last name matches but the first name does not", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Ana", "Santos", null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when the first name matches but the last name does not", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Reyes", null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when either name input is blank", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const noFirst = await lookupCheckinRegistrantByName(event.id, "  ", "Santos", null)
      expect(noFirst.success && noFirst.data === null).toBe(true)

      const noLast = await lookupCheckinRegistrantByName(event.id, "Maria", "", null)
      expect(noLast.success && noLast.data === null).toBe(true)
    })

    it("does not match registrants from a different event", async () => {
      const event1 = await seedEvent()
      const event2 = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      await db.eventRegistrant.create({ data: { eventId: event2.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByName(event1.id, "Maria", "Santos", null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })
  })

  describe("successful matches", () => {
    it("matches a Guest-linked registrant", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.kind).toBe("registrant")
        expect(result.data.subjectId).toBe(registrant.id)
        expect(result.data.name).toBe("Maria Santos")
      }
    })

    it("matches a Member-linked registrant", async () => {
      const event = await seedEvent()
      const member = await seedMember({ firstName: "Juan", lastName: "dela Cruz" })
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Juan", "dela Cruz", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.name).toBe("Juan dela Cruz")
      }
    })

    it("matches a registrant with inline personal fields (no member/guest link)", async () => {
      const event = await seedEvent()
      await db.eventRegistrant.create({
        data: { eventId: event.id, firstName: "Pedro", lastName: "Ramos" },
      })

      const result = await lookupCheckinRegistrantByName(event.id, "Pedro", "Ramos", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.name).toBe("Pedro Ramos")
      }
    })

    it("matching is case-insensitive and collapses extra whitespace", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Juan", lastName: "dela Cruz" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "  jUaN ", "DELA   cruz ", null)
      expect(isSingleMatch(result)).toBe(true)
    })

    it("accepts the registration nickname in place of the first name", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Junior", lastName: "Reyes" })
      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id, nickname: "JR" },
      })

      const result = await lookupCheckinRegistrantByName(event.id, "JR", "Reyes", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.name).toBe("Junior Reyes")
      }
    })

    it("reports alreadyCheckedIn for a OneTime registrant with attendedAt set", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
      })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(true)
      }
    })

    it("reports alreadyCheckedIn per occurrence for session events", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", occurrence.id)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(true)
      }
    })
  })

  describe("ambiguous matches and contact hints", () => {
    it("returns an ambiguous result when two registrants share the same name", async () => {
      const event = await seedEvent()
      const g1 = await seedGuest({ firstName: "Maria", lastName: "Santos", phone: "+63 917 123 4567" })
      const g2 = await seedGuest({ firstName: "Maria", lastName: "Santos", phone: "+63 918 765 9876" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g2.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", null)
      expect(isAmbiguousMatch(result)).toBe(true)
      if (isAmbiguousMatch(result)) {
        expect(result.data.candidates).toHaveLength(2)
        const hints = result.data.candidates.map((c) => c.contactHint).sort()
        expect(hints).toEqual(["+63 ••• ••• 4567", "+63 ••• ••• 9876"])
      }
    })

    it("masks the email as the hint when the registrant has no phone", async () => {
      const event = await seedEvent()
      const g1 = await seedGuest({ firstName: "Maria", lastName: "Santos", email: "maria@example.com" })
      const g2 = await seedGuest({ firstName: "Maria", lastName: "Santos", email: "ms@other.com" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g2.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", null)
      expect(isAmbiguousMatch(result)).toBe(true)
      if (isAmbiguousMatch(result)) {
        const hints = result.data.candidates.map((c) => c.contactHint).sort()
        expect(hints).toEqual(["m•••@example.com", "m•••@other.com"])
      }
    })

    it("never exposes the full phone number in the contact hint", async () => {
      const event = await seedEvent()
      const g1 = await seedGuest({ firstName: "Maria", lastName: "Santos", phone: "+63 917 123 4567" })
      const g2 = await seedGuest({ firstName: "Maria", lastName: "Santos", phone: "+63 918 765 9876" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: g2.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Maria", "Santos", null)
      expect(isAmbiguousMatch(result)).toBe(true)
      if (isAmbiguousMatch(result)) {
        for (const c of result.data.candidates) {
          expect(c.contactHint).not.toContain("917 123")
          expect(c.contactHint).not.toContain("918 765")
        }
      }
    })
  })

  describe("volunteers", () => {
    it("matches an event volunteer by their member's full name", async () => {
      const event = await seedEvent()
      const volunteer = await seedVolunteer(event.id, { firstName: "Ana", lastName: "Lopez" })

      const result = await lookupCheckinRegistrantByName(event.id, "Ana", "Lopez", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.kind).toBe("volunteer")
        expect(result.data.subjectId).toBe(volunteer.id)
      }
    })

    it("a volunteer match suppresses a same-name registrant match", async () => {
      const event = await seedEvent()
      const volunteer = await seedVolunteer(event.id, { firstName: "Ana", lastName: "Lopez" })
      const guest = await seedGuest({ firstName: "Ana", lastName: "Lopez" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByName(event.id, "Ana", "Lopez", null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.kind).toBe("volunteer")
        expect(result.data.subjectId).toBe(volunteer.id)
      }
    })

    it("does not match a volunteer by nickname (volunteers have no nickname)", async () => {
      const event = await seedEvent()
      await seedVolunteer(event.id, { firstName: "Anastacia", lastName: "Lopez" })

      const result = await lookupCheckinRegistrantByName(event.id, "Ana", "Lopez", null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })
  })
})
