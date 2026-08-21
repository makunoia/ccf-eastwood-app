import type { PrismaClient } from "@/app/generated/prisma/client"

/**
 * The two figures a per-session turnout ratio divides.
 *
 * `totalRegistrants` is the whole series roster — the same denominator the
 * dashboard's Turnout KPI uses, so a session's rate and the event's rate are
 * spoken in one vocabulary. It is deliberately *not* narrowed to the session:
 * `EventRegistrant` is one row per person per event series with no link to an
 * occurrence other than attendance itself, so there is no per-session RSVP to
 * scope to. The cost is that on a long-running Recurring event the roster grows
 * forever — see the note in `lib/events/turnout.ts`, and the surfaces that print
 * the denominator inline because of it.
 *
 * `participantsByOccurrence` is the numerator, and it counts **participants
 * only**. An `OccurrenceAttendee` holds either a `registrantId` or a
 * `volunteerId`; a volunteer has no `EventRegistrant` row, so counting them
 * would put people in the numerator who are absent from the denominator and a
 * well-staffed session would report above 100%. The Sessions list's own
 * "N people checked in" figure is volunteer-*inclusive* on purpose and stays
 * that way — the two counts answer different questions, which is why they are
 * derived separately here rather than shared.
 */
export type SessionTurnoutData = {
  /** Everyone holding a registration for this event's series. */
  totalRegistrants: number
  /** Participant check-ins per occurrence id. Absent means none. */
  participantsByOccurrence: Map<string, number>
}

export async function loadSessionTurnout(
  db: PrismaClient,
  eventId: string,
): Promise<SessionTurnoutData> {
  const [totalRegistrants, participantCheckIns] = await Promise.all([
    db.eventRegistrant.count({ where: { eventId } }),
    // Aggregated in the database rather than by pulling attendee rows — a long
    // series on a busy event is a lot of rows. Mirrors the volunteer rollup in
    // `lib/events/series-summary.ts`.
    db.occurrenceAttendee.groupBy({
      by: ["occurrenceId"],
      where: { registrantId: { not: null }, occurrence: { eventId } },
      _count: { _all: true },
    }),
  ])

  return {
    totalRegistrants,
    participantsByOccurrence: new Map(
      participantCheckIns.map((row) => [row.occurrenceId, row._count._all]),
    ),
  }
}
