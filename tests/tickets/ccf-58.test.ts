/**
 * Ticket verification suite for CCF-58.
 *
 * CCF-58: Verify if registrants with guest record are asked the "Is this you" screen.
 * The lookupMemberForRegistration action should match against Guest records (after
 * checking Members) using the same priority: phone → email → last name + birthday.
 * The returned result must include a `recordType` field so the UI can distinguish
 * member vs guest matches and call createRegistrant with the correct arguments.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  lookupMemberForRegistration,
  createRegistrant,
} from "@/app/(dashboard)/events/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "EventOccurrence", "Event", "Guest", "Member", "LifeStage", "SmallGroup" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-01"),
    },
    select: { id: true },
  })
}

async function seedGuest(overrides: Partial<{
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  birthMonth: number | null
  birthYear: number | null
}> = {}) {
  return db.guest.create({
    data: {
      firstName: overrides.firstName ?? "Juan",
      lastName: overrides.lastName ?? "Dela Cruz",
      phone: overrides.phone !== undefined ? overrides.phone : "+63 917 123 4567",
      email: overrides.email !== undefined ? overrides.email : "juan@example.com",
      birthMonth: overrides.birthMonth ?? 3,
      birthYear: overrides.birthYear ?? 1995,
      language: [],
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  })
}

describe("CCF-58 — Guest record matching on registration", () => {
  describe("unit: lookupMemberForRegistration returns recordType", () => {
    it("returns recordType='member' when a member is matched by phone", async () => {
      await db.member.create({
        data: {
          firstName: "Maria",
          lastName: "Santos",
          phone: "+63 918 111 1111",
          dateJoined: new Date(),
          language: [],
        },
      })

      const result = await lookupMemberForRegistration({ mobileNumber: "+63 918 111 1111" })

      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.recordType).toBe("member")
      expect(result.matchedBy).toBe("mobile")
    })

    it("returns recordType='guest' when no member found but guest matches by phone", async () => {
      await seedGuest({ phone: "+63 917 123 4567" })

      const result = await lookupMemberForRegistration({ mobileNumber: "+63 917 123 4567" })

      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.recordType).toBe("guest")
      expect(result.matchedBy).toBe("mobile")
      expect(result.firstName).toBe("Juan")
    })

    it("returns recordType='guest' when no member found but guest matches by email", async () => {
      await seedGuest({ phone: null, email: "juan@example.com" })

      const result = await lookupMemberForRegistration({ email: "juan@example.com" })

      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.recordType).toBe("guest")
      expect(result.matchedBy).toBe("email")
    })

    it("returns recordType='guest' when no member found but guest matches by name+birthday", async () => {
      await seedGuest({ phone: null, email: null, lastName: "Dela Cruz", birthMonth: 3, birthYear: 1995 })

      const result = await lookupMemberForRegistration({
        lastName: "Dela Cruz",
        birthMonth: 3,
        birthYear: 1995,
      })

      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.recordType).toBe("guest")
      expect(result.matchedBy).toBe("nameBirthday")
    })

    it("does not match a promoted guest (memberId set)", async () => {
      const member = await db.member.create({
        data: {
          firstName: "Juan",
          lastName: "Dela Cruz",
          phone: "+63 917 123 4567",
          dateJoined: new Date(),
          language: [],
        },
      })
      // Promoted guest: memberId is set
      await db.guest.create({
        data: {
          firstName: "Juan",
          lastName: "Dela Cruz",
          phone: "+63 917 123 4567",
          language: [],
          memberId: member.id,
        },
      })

      // Phone matches the member record — should return member, not guest
      const result = await lookupMemberForRegistration({ mobileNumber: "+63 917 123 4567" })

      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.recordType).toBe("member")
    })

    it("returns null when no member or guest found", async () => {
      const result = await lookupMemberForRegistration({ mobileNumber: "+63 919 999 9999" })
      expect(result).toBeNull()
    })
  })

  describe("integration: createRegistrant links to confirmed guest", () => {
    it("links to existing guest when confirmedGuestId is provided", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      const result = await createRegistrant(
        event.id,
        {
          firstName: "Juan",
          lastName: "Dela Cruz",
          mobileNumber: "+63 917 123 4567",
          language: [],
        },
        null,
        guest.id
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true, memberId: true },
      })
      expect(registrant?.guestId).toBe(guest.id)
      expect(registrant?.memberId).toBeNull()
    })

    it("creates a new guest when skipDeduplication=true (user said 'That's not me')", async () => {
      const event = await seedEvent()
      // Pre-existing guest with same phone
      await seedGuest({ phone: "+63 917 123 4567" })

      const result = await createRegistrant(
        event.id,
        {
          firstName: "Different",
          lastName: "Person",
          mobileNumber: "+63 917 123 4567",
          language: [],
        },
        null,
        null,
        true // skipDeduplication
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })

      // Should have created a new guest, not reused the existing one
      const newGuest = await db.guest.findUnique({ where: { id: registrant!.guestId! } })
      expect(newGuest?.firstName).toBe("Different")
      expect(newGuest?.lastName).toBe("Person")
    })
  })

  describe("regression: existing guest deduplication still works without skipDeduplication", () => {
    it("reuses existing guest when no confirmation flow is triggered", async () => {
      const event = await seedEvent()
      const existingGuest = await seedGuest({ phone: "+63 917 123 4567" })

      // Register without any confirmation (normal path, no match shown)
      const result = await createRegistrant(
        event.id,
        {
          firstName: "Juan",
          lastName: "Dela Cruz",
          mobileNumber: "+63 917 123 4567",
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })
      expect(registrant?.guestId).toBe(existingGuest.id)
    })
  })
})
