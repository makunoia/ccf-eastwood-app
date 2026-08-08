import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { isReturner } from "@/lib/session-stats"

/**
 * CCF-81: Revamped Event Days/Session Detail page
 *
 * The session detail page for recurring/multi-day events must show:
 * - Stats: total attended, new registrants, returnees, volunteers present
 * - Breakout groups table with facilitator presence + new/returnee counts per group
 */
describe("CCF-81", () => {
  describe("unit: isReturner", () => {
    it("returns false when attendances is empty", () => {
      expect(isReturner([], "occ1", new Date("2024-01-15"))).toBe(false)
    })

    it("returns false when only the current occurrence attendance exists", () => {
      expect(
        isReturner(
          [{ occurrenceId: "occ1", occurrence: { date: new Date("2024-01-15") } }],
          "occ1",
          new Date("2024-01-15"),
        ),
      ).toBe(false)
    })

    it("returns true when a prior occurrence attendance exists", () => {
      expect(
        isReturner(
          [
            { occurrenceId: "occ0", occurrence: { date: new Date("2024-01-08") } },
            { occurrenceId: "occ1", occurrence: { date: new Date("2024-01-15") } },
          ],
          "occ1",
          new Date("2024-01-15"),
        ),
      ).toBe(true)
    })

    it("returns false when the other attendance is a later occurrence", () => {
      // person attended occ2 (future) but not occ1 (current) previously
      expect(
        isReturner(
          [{ occurrenceId: "occ2", occurrence: { date: new Date("2024-01-22") } }],
          "occ1",
          new Date("2024-01-15"),
        ),
      ).toBe(false)
    })

    it("returns true with multiple past attendances", () => {
      expect(
        isReturner(
          [
            { occurrenceId: "occ0", occurrence: { date: new Date("2024-01-01") } },
            { occurrenceId: "occ1", occurrence: { date: new Date("2024-01-08") } },
            { occurrenceId: "occ2", occurrence: { date: new Date("2024-01-15") } },
          ],
          "occ2",
          new Date("2024-01-15"),
        ),
      ).toBe(true)
    })
  })

  describe("integration: new vs returner classification", () => {
    let eventId: string
    let occ1Id: string
    let occ2Id: string

    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "EventOccurrence", "EventMinistry", "Event", "LifeStage" RESTART IDENTITY CASCADE`

      const event = await db.event.create({
        data: {
          name: "Sunday Service",
          type: "Recurring",
          startDate: new Date("2024-01-01"),
          endDate: new Date("2024-03-31"),
        },
      })
      eventId = event.id

      const occ1 = await db.eventOccurrence.create({
        data: { eventId, date: new Date("2024-01-08T00:00:00Z"), isOpen: false },
      })
      occ1Id = occ1.id

      const occ2 = await db.eventOccurrence.create({
        data: { eventId, date: new Date("2024-01-15T00:00:00Z"), isOpen: true },
      })
      occ2Id = occ2.id
    })

    afterAll(async () => {
      await db.$disconnect()
    })

    it("classifies a first-time attendee as new", async () => {
      const reg = await db.eventRegistrant.create({
        data: { eventId, firstName: "Alice", lastName: "New" },
      })
      // Only attends occ2 — no prior attendances
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ2Id, registrantId: reg.id },
      })

      const occ2 = await db.eventOccurrence.findUniqueOrThrow({
        where: { id: occ2Id },
        include: {
          attendees: {
            include: {
              registrant: {
                select: {
                  occurrenceAttendances: {
                    select: { occurrenceId: true, occurrence: { select: { date: true } } },
                  },
                },
              },
            },
          },
        },
      })

      const attendee = occ2.attendees[0]
      const returner = isReturner(
        attendee.registrant!.occurrenceAttendances,
        occ2Id,
        occ2.date,
      )
      expect(returner).toBe(false)
    })

    it("classifies someone who attended occ1 as a returner on occ2", async () => {
      const reg = await db.eventRegistrant.create({
        data: { eventId, firstName: "Bob", lastName: "Returning" },
      })
      // Attended occ1 and occ2
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ1Id, registrantId: reg.id },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ2Id, registrantId: reg.id },
      })

      const occ2 = await db.eventOccurrence.findUniqueOrThrow({
        where: { id: occ2Id },
        include: {
          attendees: {
            include: {
              registrant: {
                select: {
                  occurrenceAttendances: {
                    select: { occurrenceId: true, occurrence: { select: { date: true } } },
                  },
                },
              },
            },
          },
        },
      })

      const attendee = occ2.attendees[0]
      const returner = isReturner(
        attendee.registrant!.occurrenceAttendances,
        occ2Id,
        occ2.date,
      )
      expect(returner).toBe(true)
    })

    it("correctly separates new and returning attendees in a mixed session", async () => {
      const alice = await db.eventRegistrant.create({
        data: { eventId, firstName: "Alice", lastName: "New" },
      })
      const bob = await db.eventRegistrant.create({
        data: { eventId, firstName: "Bob", lastName: "Returning" },
      })

      // Bob attended occ1; Alice did not
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ1Id, registrantId: bob.id },
      })
      // Both attend occ2
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ2Id, registrantId: alice.id },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ2Id, registrantId: bob.id },
      })

      const occ2 = await db.eventOccurrence.findUniqueOrThrow({
        where: { id: occ2Id },
        include: {
          attendees: {
            include: {
              registrant: {
                select: {
                  id: true,
                  occurrenceAttendances: {
                    select: { occurrenceId: true, occurrence: { select: { date: true } } },
                  },
                },
              },
            },
          },
        },
      })

      const stats = occ2.attendees.map((a) => ({
        registrantId: a.registrant!.id,
        isReturner: isReturner(a.registrant!.occurrenceAttendances, occ2Id, occ2.date),
      }))

      const aliceStat = stats.find((s) => s.registrantId === alice.id)
      const bobStat = stats.find((s) => s.registrantId === bob.id)

      expect(aliceStat?.isReturner).toBe(false)
      expect(bobStat?.isReturner).toBe(true)
      expect(stats.filter((s) => !s.isReturner).length).toBe(1) // 1 new
      expect(stats.filter((s) => s.isReturner).length).toBe(1)  // 1 returner
    })
  })

  describe("regression", () => {
    it("isReturner does not count same-day future occurrences as prior attendance", () => {
      // Two occurrences on the same day would be unusual, but ensure date comparison is correct
      const sameDate = new Date("2024-01-15T00:00:00Z")
      // Same date but different occurrenceId — should NOT count as prior (date is not < current)
      expect(
        isReturner(
          [{ occurrenceId: "occ-other", occurrence: { date: sameDate } }],
          "occ-current",
          sameDate,
        ),
      ).toBe(false)
    })
  })
})
