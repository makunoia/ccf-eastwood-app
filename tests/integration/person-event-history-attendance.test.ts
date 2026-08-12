import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { resolveRegistrationAttendance } from "@/lib/events/registration-attendance"

/**
 * The attendance pill on the Events tab of a person's detail page.
 *
 *  - integration: the `_count` relations the member/guest detail pages select
 *                 (`EventRegistrant.occurrenceAttendances`, `Event.occurrences`)
 *                 resolve against real rows and feed the pill correctly
 *  - regression:  a MultiDay/Recurring registrant who checked in used to read
 *                 "Absent", because the pill only looked at `attendedAt` —
 *                 a OneTime-only field
 *  - unit:        label/tone rules in tests/unit/registration-attendance
 *  - e2e:         skipped — this is a badge rendered from data asserted here;
 *                 the browser adds no behaviour
 */

const NOW = new Date("2026-08-10T04:00:00.000Z")

// Mirrors the include block in getMemberEventRegistrations /
// getGuestEventRegistrations — if a relation is renamed, this test breaks.
const registrationInclude = {
  _count: { select: { occurrenceAttendances: true } },
  event: {
    include: {
      _count: { select: { occurrences: true } },
      ministries: { include: { ministry: { select: { name: true } } } },
    },
  },
} as const

async function pillFor(registrantId: string) {
  const r = await db.eventRegistrant.findUniqueOrThrow({
    where: { id: registrantId },
    include: registrationInclude,
  })
  return resolveRegistrationAttendance(
    {
      eventType: r.event.type,
      endDate: r.event.endDate,
      attendedAt: r.attendedAt,
      attendedCount: r._count.occurrenceAttendances,
      occurrenceCount: r.event._count.occurrences,
    },
    NOW,
  )
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Event", "Guest", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedGuest(firstName: string) {
  return db.guest.create({
    data: { firstName, lastName: "Tester", language: [] },
  })
}

describe("person event history — attendance pill", () => {
  it("shows a MultiDay attendee their days, not 'Absent'", async () => {
    const guest = await seedGuest("Multi")
    const event = await db.event.create({
      data: {
        name: "Camp",
        type: "MultiDay",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-03T00:00:00.000Z"),
      },
    })
    const occurrences = await Promise.all(
      ["2026-07-01", "2026-07-02", "2026-07-03"].map((d) =>
        db.eventOccurrence.create({
          data: { eventId: event.id, date: new Date(`${d}T00:00:00.000Z`) },
        }),
      ),
    )
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    await db.occurrenceAttendee.createMany({
      data: occurrences.slice(0, 2).map((o) => ({
        occurrenceId: o.id,
        registrantId: registrant.id,
      })),
    })

    // attendedAt is null here — the old pill read this row as "Absent".
    expect(registrant.attendedAt).toBeNull()
    expect(await pillFor(registrant.id)).toEqual({
      label: "2 of 3 days",
      tone: "attended",
    })
  })

  it("shows a Recurring attendee their session count", async () => {
    const guest = await seedGuest("Weekly")
    const event = await db.event.create({
      data: {
        name: "Midweek",
        type: "Recurring",
        startDate: new Date("2026-01-07T00:00:00.000Z"),
        endDate: new Date("2026-01-07T00:00:00.000Z"),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    for (const d of ["2026-01-07", "2026-01-14", "2026-01-21"]) {
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(`${d}T00:00:00.000Z`) },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })
    }

    expect(await pillFor(registrant.id)).toEqual({
      label: "3 sessions",
      tone: "attended",
    })
  })

  it("does not count another registrant's check-ins", async () => {
    const [attendee, noShow] = await Promise.all([
      seedGuest("Present"),
      seedGuest("Missing"),
    ])
    const event = await db.event.create({
      data: {
        name: "Camp",
        type: "MultiDay",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-02T00:00:00.000Z"),
      },
    })
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-01T00:00:00.000Z") },
    })
    const [present, absent] = await Promise.all([
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: attendee.id } }),
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: noShow.id } }),
    ])
    await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, registrantId: present.id },
    })

    expect((await pillFor(present.id)).tone).toBe("attended")
    expect(await pillFor(absent.id)).toEqual({ label: "Absent", tone: "absent" })
  })

  it("keeps OneTime attendance on attendedAt", async () => {
    const guest = await seedGuest("Once")
    const event = await db.event.create({
      data: {
        name: "Gala",
        type: "OneTime",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        guestId: guest.id,
        attendedAt: new Date("2026-07-01T10:00:00.000Z"),
      },
    })

    expect(await pillFor(registrant.id)).toEqual({
      label: "Attended",
      tone: "attended",
    })
  })

  it("calls a registration for an event that has not happened 'Registered'", async () => {
    const guest = await seedGuest("Future")
    const event = await db.event.create({
      data: {
        name: "Next month",
        type: "OneTime",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-01T00:00:00.000Z"),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    expect(await pillFor(registrant.id)).toEqual({
      label: "Registered",
      tone: "pending",
    })
  })
})
