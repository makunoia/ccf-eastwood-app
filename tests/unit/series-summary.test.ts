import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { loadRecurringSeriesSummaries } from "@/lib/events/series-summary"

async function seedRecurringEvent() {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "Recurring",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      recurrenceDayOfWeek: 0,
      recurrenceFrequency: "Weekly",
    },
  })
}

async function addAttendees(occurrenceId: string, eventId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const registrant = await db.eventRegistrant.create({
      data: { eventId, firstName: `Attendee${i}`, lastName: occurrenceId.slice(-4) },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId, registrantId: registrant.id },
    })
  }
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee",
    "EventRegistrant",
    "EventOccurrence",
    "EventOccurrenceSeries",
    "Event"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("loadRecurringSeriesSummaries", () => {
  // Regression: series summaries must reflect the ENTIRE series, independent of
  // the dashboard's rolling period window. Previously the loader fed the
  // period-filtered occurrence query (default last 30 days, capped at "now")
  // into the grouping, so a series whose sessions sat in the future or older
  // than the window showed all-zero / partial rollups.
  it("counts every session in a series regardless of date window", async () => {
    const event = await seedRecurringEvent()

    const series = await db.eventOccurrenceSeries.create({
      data: {
        eventId: event.id,
        title: "Full Year",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    })

    // A past session, a recent session, and a future session — only the recent
    // one would fall inside a typical 30-day-up-to-now window.
    const past = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-01-04T00:00:00Z"), seriesId: series.id },
    })
    const recent = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-06-07T00:00:00Z"), seriesId: series.id },
    })
    const future = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-12-06T00:00:00Z"), seriesId: series.id },
    })

    await addAttendees(past.id, event.id, 5)
    await addAttendees(recent.id, event.id, 3)
    await addAttendees(future.id, event.id, 4)

    const summaries = await loadRecurringSeriesSummaries(db, event.id)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].sessionCount).toBe(3)
    expect(summaries[0].totalAttendance).toBe(12)
    expect(summaries[0].averageAttendance).toBe(4)
  })

  it("reports a brand-new series with future-only sessions as non-zero", async () => {
    const event = await seedRecurringEvent()

    const series = await db.eventOccurrenceSeries.create({
      data: {
        eventId: event.id,
        title: "Upcoming Run",
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    })

    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-11-08T00:00:00Z"), seriesId: series.id },
    })
    await addAttendees(occurrence.id, event.id, 2)

    const summaries = await loadRecurringSeriesSummaries(db, event.id)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].sessionCount).toBe(1)
    expect(summaries[0].totalAttendance).toBe(2)
  })

  it("keeps each series' totals separate and excludes stand-alone occurrences", async () => {
    const event = await seedRecurringEvent()

    const q1 = await db.eventOccurrenceSeries.create({
      data: {
        eventId: event.id,
        title: "Q1",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-03-31T00:00:00Z"),
      },
    })
    const q2 = await db.eventOccurrenceSeries.create({
      data: {
        eventId: event.id,
        title: "Q2",
        startDate: new Date("2026-04-01T00:00:00Z"),
        endDate: new Date("2026-06-30T00:00:00Z"),
      },
    })

    const q1a = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-01-04T00:00:00Z"), seriesId: q1.id },
    })
    const q2a = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-04-05T00:00:00Z"), seriesId: q2.id },
    })
    // Stand-alone, ungrouped session — must not roll into any series total.
    const standalone = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-05-10T00:00:00Z"), isStandalone: true },
    })

    await addAttendees(q1a.id, event.id, 6)
    await addAttendees(q2a.id, event.id, 2)
    await addAttendees(standalone.id, event.id, 9)

    const summaries = await loadRecurringSeriesSummaries(db, event.id)
    const byTitle = Object.fromEntries(summaries.map((s) => [s.title, s]))

    expect(summaries).toHaveLength(2)
    expect(byTitle.Q1.totalAttendance).toBe(6)
    expect(byTitle.Q2.totalAttendance).toBe(2)
    // ranges ordered startDate desc → Q2 first, Q1 second
    expect(summaries[0].title).toBe("Q2")
  })
})
