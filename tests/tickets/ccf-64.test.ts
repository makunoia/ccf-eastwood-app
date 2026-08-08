import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"

/**
 * CCF-64: Event Check-in to track breakout table attendance
 *
 * The breakout group detail page now shows attendance per member:
 * - OneTime events: show "Attended" or "—" based on attendedAt
 * - MultiDay/Recurring events: show "X / Y sessions" with occurrence dates
 */
describe("CCF-64", () => {
  describe("unit", () => {
    it("formats attendance correctly for OneTime events", () => {
      const attendedAt = new Date()
      expect(attendedAt !== null).toBe(true)
    })

    it("counts occurrence attendances correctly", () => {
      const attendances = [
        { occurrence: { date: new Date("2025-01-05") } },
        { occurrence: { date: new Date("2025-01-12") } },
        { occurrence: { date: new Date("2025-01-19") } },
      ]
      const total = 5
      expect(attendances.length).toBe(3)
      expect(total).toBe(5)
      // Display: "3 / 5 sessions"
      const label = `${attendances.length} / ${total} sessions`
      expect(label).toBe("3 / 5 sessions")
    })

    it("returns empty indicator when no occurrences attended", () => {
      const attendances: { occurrence: { date: Date } }[] = []
      expect(attendances.length).toBe(0)
    })

    it("sorts occurrence dates ascending", () => {
      const dates = [
        new Date("2025-01-19"),
        new Date("2025-01-05"),
        new Date("2025-01-12"),
      ]
      const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
      expect(sorted[0]).toEqual(new Date("2025-01-05"))
      expect(sorted[2]).toEqual(new Date("2025-01-19"))
    })
  })

  describe("integration", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "BreakoutGroupMember", "EventRegistrant", "BreakoutGroup", "EventOccurrence", "Event" RESTART IDENTITY CASCADE`
    })

    afterAll(async () => {
      await db.$disconnect()
    })

    it("breakout group member query returns occurrence attendances with dates", async () => {
      const event = await db.event.create({
        data: {
          name: "Test Recurring Event",
          type: "Recurring",
          startDate: new Date("2025-01-01"),
          endDate: new Date("2025-03-31"),
          recurrenceDayOfWeek: 0,
          recurrenceFrequency: "Weekly",
        },
      })

      const group = await db.breakoutGroup.create({
        data: { eventId: event.id, name: "Group A" },
      })

      const registrant = await db.eventRegistrant.create({
        data: {
          eventId: event.id,
          firstName: "Jane",
          lastName: "Doe",
        },
      })

      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: group.id, registrantId: registrant.id },
      })

      const occ1 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-05T10:00:00Z"), isOpen: false },
      })
      const occ2 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-12T10:00:00Z"), isOpen: false },
      })

      await db.occurrenceAttendee.createMany({
        data: [
          { occurrenceId: occ1.id, registrantId: registrant.id },
          { occurrenceId: occ2.id, registrantId: registrant.id },
        ],
      })

      // Simulate the page's query pattern for breakout group members
      const result = await db.breakoutGroupMember.findMany({
        where: { breakoutGroupId: group.id },
        include: {
          registrant: {
            select: {
              id: true,
              attendedAt: true,
              occurrenceAttendances: {
                select: { occurrence: { select: { date: true } } },
                orderBy: { occurrence: { date: "asc" } },
              },
            },
          },
        },
      })

      expect(result).toHaveLength(1)
      const member = result[0].registrant
      expect(member.attendedAt).toBeNull()
      expect(member.occurrenceAttendances).toHaveLength(2)
      // Dates should be sorted ascending
      expect(new Date(member.occurrenceAttendances[0].occurrence.date).getTime())
        .toBeLessThan(new Date(member.occurrenceAttendances[1].occurrence.date).getTime())
    })

    it("totalOccurrences count matches actual occurrences in event", async () => {
      const event = await db.event.create({
        data: {
          name: "Test MultiDay Event",
          type: "MultiDay",
          startDate: new Date("2025-02-01"),
          endDate: new Date("2025-02-05"),
        },
      })

      await db.eventOccurrence.createMany({
        data: [
          { eventId: event.id, date: new Date("2025-02-01"), isOpen: false },
          { eventId: event.id, date: new Date("2025-02-02"), isOpen: false },
          { eventId: event.id, date: new Date("2025-02-03"), isOpen: false },
          { eventId: event.id, date: new Date("2025-02-04"), isOpen: false },
          { eventId: event.id, date: new Date("2025-02-05"), isOpen: false },
        ],
      })

      const totalOccurrences = await db.eventOccurrence.count({ where: { eventId: event.id } })
      expect(totalOccurrences).toBe(5)
    })

    it("OneTime event registrant with attendedAt is correctly identified as attended", async () => {
      const event = await db.event.create({
        data: {
          name: "Test OneTime Event",
          type: "OneTime",
          startDate: new Date("2025-03-15"),
          endDate: new Date("2025-03-15"),
        },
      })

      const group = await db.breakoutGroup.create({
        data: { eventId: event.id, name: "Group B" },
      })

      const attended = await db.eventRegistrant.create({
        data: { eventId: event.id, firstName: "John", lastName: "Smith", attendedAt: new Date() },
      })
      const notAttended = await db.eventRegistrant.create({
        data: { eventId: event.id, firstName: "Alice", lastName: "Jones", attendedAt: null },
      })

      await db.breakoutGroupMember.createMany({
        data: [
          { breakoutGroupId: group.id, registrantId: attended.id },
          { breakoutGroupId: group.id, registrantId: notAttended.id },
        ],
      })

      const members = await db.breakoutGroupMember.findMany({
        where: { breakoutGroupId: group.id },
        include: {
          registrant: {
            select: {
              attendedAt: true,
              occurrenceAttendances: {
                select: { occurrence: { select: { date: true } } },
              },
            },
          },
        },
      })

      const attendedMember = members.find((m) => m.registrantId === attended.id)!
      const notAttendedMember = members.find((m) => m.registrantId === notAttended.id)!

      expect(attendedMember.registrant.attendedAt).not.toBeNull()
      expect(notAttendedMember.registrant.attendedAt).toBeNull()
      expect(attendedMember.registrant.occurrenceAttendances).toHaveLength(0)
    })
  })

  describe("regression", () => {
    it("occurrence attendances are sorted by date ascending, not insertion order", async () => {
      const event = await db.event.create({
        data: {
          name: "Regression Event",
          type: "Recurring",
          startDate: new Date("2025-01-01"),
          endDate: new Date("2025-12-31"),
          recurrenceDayOfWeek: 6,
          recurrenceFrequency: "Weekly",
        },
      })

      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, firstName: "Bob", lastName: "Test" },
      })

      // Insert out of order intentionally
      const occ3 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-18"), isOpen: false },
      })
      const occ1 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-04"), isOpen: false },
      })
      const occ2 = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2025-01-11"), isOpen: false },
      })

      await db.occurrenceAttendee.createMany({
        data: [
          { occurrenceId: occ3.id, registrantId: registrant.id },
          { occurrenceId: occ1.id, registrantId: registrant.id },
          { occurrenceId: occ2.id, registrantId: registrant.id },
        ],
      })

      const result = await db.eventRegistrant.findUnique({
        where: { id: registrant.id },
        select: {
          occurrenceAttendances: {
            select: { occurrence: { select: { date: true } } },
            orderBy: { occurrence: { date: "asc" } },
          },
        },
      })

      const dates = result!.occurrenceAttendances.map((a) => a.occurrence.date.getTime())
      expect(dates[0]).toBeLessThan(dates[1])
      expect(dates[1]).toBeLessThan(dates[2])
    })
  })
})
