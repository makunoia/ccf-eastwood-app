import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"
import { db } from "@/lib/db"
import { lookupCheckinRegistrantByProfile } from "@/app/(dashboard)/events/actions"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedEvent(type: "OneTime" | "Recurring" = "OneTime") {
  return db.event.create({
    data: { name: "Test Event", type, startDate: new Date(), endDate: new Date() },
  })
}

async function seedGuest(overrides: {
  firstName?: string
  lastName: string
  birthMonth?: number | null
  birthYear?: number | null
}) {
  return db.guest.create({
    data: {
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName,
      birthMonth: overrides.birthMonth ?? null,
      birthYear: overrides.birthYear ?? null,
      language: [],
    },
  })
}

async function seedMember(overrides: {
  firstName?: string
  lastName: string
  birthMonth?: number | null
  birthYear?: number | null
}) {
  return db.member.create({
    data: {
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName,
      birthMonth: overrides.birthMonth ?? null,
      birthYear: overrides.birthYear ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

function isSingleMatch(
  result: Awaited<ReturnType<typeof lookupCheckinRegistrantByProfile>>
): result is { success: true; data: { registrantId: string; name: string; nickname: string | null; alreadyCheckedIn: boolean; guestSmallGroupPrompt: null } } {
  return result.success && result.data !== null && !("matchType" in (result.data as object))
}

function isAmbiguousMatch(
  result: Awaited<ReturnType<typeof lookupCheckinRegistrantByProfile>>
): result is { success: true; data: { matchType: "ambiguous"; candidates: Array<{ registrantId: string; name: string; nickname: string | null; alreadyCheckedIn: boolean; guestSmallGroupPrompt: null }> } } {
  return result.success && result.data !== null && "matchType" in (result.data as object)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "EventOccurrence", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ── Integration: core matching ────────────────────────────────────────────────

describe("lookupCheckinRegistrantByProfile", () => {
  describe("core matching", () => {
    it("returns null when no registrants exist for the event", async () => {
      const event = await seedEvent()
      const result = await lookupCheckinRegistrantByProfile(event.id, "Smith", 5, 1990, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when last name matches but birth month does not", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Garcia", birthMonth: 6, birthYear: 1992 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Garcia", 7, 1992, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when last name matches but birth year does not", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Garcia", birthMonth: 6, birthYear: 1992 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Garcia", 6, 1993, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null when birth month and year match but last name does not", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Santos", birthMonth: 3, birthYear: 1995 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Reyes", 3, 1995, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("returns null for registrants without birth data on file", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Torres", birthMonth: null, birthYear: null })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Torres", 1, 1985, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })

    it("does not match registrants from a different event", async () => {
      const event1 = await seedEvent()
      const event2 = await seedEvent()
      const guest = await seedGuest({ lastName: "Torres", birthMonth: 1, birthYear: 1985 })
      await db.eventRegistrant.create({ data: { eventId: event2.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event1.id, "Torres", 1, 1985, null)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toBeNull()
    })
  })

  describe("successful matches", () => {
    it("matches a Guest-linked registrant and returns the correct name", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ firstName: "Maria", lastName: "Santos", birthMonth: 3, birthYear: 1995 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Santos", 3, 1995, null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.name).toBe("Maria Santos")
      }
    })

    it("matches a Member-linked registrant and returns the correct name", async () => {
      const event = await seedEvent()
      const member = await seedMember({ firstName: "Juan", lastName: "dela Cruz", birthMonth: 5, birthYear: 1990 })
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "dela Cruz", 5, 1990, null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.name).toBe("Juan dela Cruz")
      }
    })

    it("last name matching is case-insensitive", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Reyes", birthMonth: 8, birthYear: 1988 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const upper = await lookupCheckinRegistrantByProfile(event.id, "REYES", 8, 1988, null)
      expect(isSingleMatch(upper)).toBe(true)

      const lower = await lookupCheckinRegistrantByProfile(event.id, "reyes", 8, 1988, null)
      expect(isSingleMatch(lower)).toBe(true)

      const mixed = await lookupCheckinRegistrantByProfile(event.id, "ReYeS", 8, 1988, null)
      expect(isSingleMatch(mixed)).toBe(true)
    })

    it("trims whitespace from the last name input", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Navarro", birthMonth: 9, birthYear: 1987 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "  Navarro  ", 9, 1987, null)
      expect(isSingleMatch(result)).toBe(true)
    })
  })

  describe("ambiguous matches", () => {
    it("returns matchType: ambiguous when multiple registrants share the same last name and DOB", async () => {
      const event = await seedEvent()
      const guest1 = await seedGuest({ firstName: "Carlo", lastName: "Mendoza", birthMonth: 11, birthYear: 1993 })
      const guest2 = await seedGuest({ firstName: "Carlos", lastName: "Mendoza", birthMonth: 11, birthYear: 1993 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest2.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Mendoza", 11, 1993, null)
      expect(isAmbiguousMatch(result)).toBe(true)
      if (isAmbiguousMatch(result)) {
        expect(result.data.matchType).toBe("ambiguous")
        expect(result.data.candidates).toHaveLength(2)
      }
    })

    it("ambiguous result includes both candidates' names", async () => {
      const event = await seedEvent()
      const guest1 = await seedGuest({ firstName: "Ana", lastName: "Cruz", birthMonth: 4, birthYear: 1994 })
      const guest2 = await seedGuest({ firstName: "Anna", lastName: "Cruz", birthMonth: 4, birthYear: 1994 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest1.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest2.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Cruz", 4, 1994, null)
      expect(isAmbiguousMatch(result)).toBe(true)
      if (isAmbiguousMatch(result)) {
        const names = (result.data.candidates as Array<{ name: string }>).map((c) => c.name)
        expect(names).toContain("Ana Cruz")
        expect(names).toContain("Anna Cruz")
      }
    })
  })

  describe("alreadyCheckedIn", () => {
    it("returns alreadyCheckedIn: false when attendedAt is not set (one-time event)", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Villanueva", birthMonth: 4, birthYear: 1991 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Villanueva", 4, 1991, null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(false)
      }
    })

    it("returns alreadyCheckedIn: true when attendedAt is set (one-time event)", async () => {
      const event = await seedEvent()
      const guest = await seedGuest({ lastName: "Villanueva", birthMonth: 4, birthYear: 1991 })
      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
      })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Villanueva", 4, 1991, null)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(true)
      }
    })

    it("returns alreadyCheckedIn: false when OccurrenceAttendee does not exist", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      const guest = await seedGuest({ lastName: "Navarro", birthMonth: 9, birthYear: 1987 })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Navarro", 9, 1987, occurrence.id)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(false)
      }
    })

    it("returns alreadyCheckedIn: true when OccurrenceAttendee exists for that occurrence", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
      })
      const guest = await seedGuest({ lastName: "Navarro", birthMonth: 9, birthYear: 1987 })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id, checkedInAt: new Date() },
      })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Navarro", 9, 1987, occurrence.id)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(true)
      }
    })

    it("occurrence check-in status is scoped — a different occurrence does not mark as checked in", async () => {
      const event = await seedEvent("Recurring")
      const occurrence1 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-01"), isOpen: false },
      })
      const occurrence2 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-08"), isOpen: true },
      })
      const guest = await seedGuest({ lastName: "Reyes", birthMonth: 2, birthYear: 1989 })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      // Checked in to occurrence1, not occurrence2
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence1.id, registrantId: registrant.id, checkedInAt: new Date() },
      })

      const result = await lookupCheckinRegistrantByProfile(event.id, "Reyes", 2, 1989, occurrence2.id)
      expect(isSingleMatch(result)).toBe(true)
      if (isSingleMatch(result)) {
        expect(result.data.alreadyCheckedIn).toBe(false)
      }
    })
  })
})

// ── Regression: UI wiring ─────────────────────────────────────────────────────

describe("checkin-board UI – name-dob mode", () => {
  const checkinBoardPath = resolve(
    process.cwd(),
    "app/events/[id]/checkin/checkin-board.tsx"
  )
  const content = readFileSync(checkinBoardPath, "utf-8")

  it("imports lookupCheckinRegistrantByProfile", () => {
    expect(content).toContain("lookupCheckinRegistrantByProfile")
  })

  it("declares the name-dob lookup mode", () => {
    expect(content).toContain('"name-dob"')
  })

  it("renders the 'I don't have either' toggle option", () => {
    expect(content).toContain("I don")
    expect(content).toContain("have either")
  })

  it("renders the last name, birth month, and birth year fields", () => {
    expect(content).toContain("namedob-lastname")
    expect(content).toContain("namedob-month")
    expect(content).toContain("namedob-year")
  })

  it("calls lookupCheckinRegistrantByProfile with parsed integers for month and year", () => {
    expect(content).toContain("parseInt(nameDobForm.birthMonth")
    expect(content).toContain("parseInt(nameDobForm.birthYear")
  })

  it("resets nameDobForm on reset()", () => {
    expect(content).toContain('setNameDobForm({ lastName: "", birthMonth: "", birthYear: "" })')
  })
})
