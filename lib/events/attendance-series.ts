/**
 * "Attendance by Session" chart data.
 *
 * A check-in row is either a participant (`registrantId` set) or a volunteer
 * (`volunteerId` set). Every other attendance figure on the dashboard — unique
 * attendees, the life-stage breakdown, turnout — counts participants only, so
 * the chart's headline series does too.
 *
 * The Sessions page badge, by contrast, counts *all* check-in rows. Neither side
 * is wrong, but the two screens reported different numbers for the same session
 * with nothing on either to explain the gap. Carrying the volunteer count
 * alongside the participant count closes it: the chart plots the two as separate
 * series and labels its headline stat "participant check-ins", so the shortfall
 * against the Sessions badge is visible rather than mysterious.
 *
 * `totalCheckIns` is the reconciliation value — it equals the Sessions badge for
 * the same occurrence, which is what the integration test pins.
 */

export type AttendanceSeriesPoint = {
  /** UTC-midnight ISO date of the session. */
  date: string
  /** Participant check-ins — the headline series. */
  attendees: number
  /** Volunteer check-ins on the same session. */
  volunteers: number
  /** `attendees + volunteers`; reconciles with the Sessions page badge. */
  totalCheckIns: number
}

export type AttendanceSeries = {
  points: AttendanceSeriesPoint[]
  /** Participant check-ins across every session in the window. */
  totalAttendees: number
  /** Volunteer check-ins across every session in the window. */
  totalVolunteers: number
  /** Sessions in the window — the denominator behind `averageAttendance`. */
  sessionCount: number
  /**
   * Mean participant check-ins per session. Sessions that happened and drew
   * nobody are real zeroes and stay in the denominator; sessions that have not
   * happened yet are excluded upstream by the period's end-of-today bound, so
   * they can no longer drag the average down.
   */
  averageAttendance: number
}

export type AttendanceSeriesInput = {
  occurrenceId: string
  date: Date
  /** Participant check-ins for this occurrence. */
  attendees: number
}

export function buildAttendanceSeries(
  occurrences: AttendanceSeriesInput[],
  volunteerCountsByOccurrence: Map<string, number> = new Map(),
): AttendanceSeries {
  const points = occurrences
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((occurrence) => {
      const volunteers = volunteerCountsByOccurrence.get(occurrence.occurrenceId) ?? 0
      return {
        date: occurrence.date.toISOString(),
        attendees: occurrence.attendees,
        volunteers,
        totalCheckIns: occurrence.attendees + volunteers,
      }
    })

  const totalAttendees = points.reduce((sum, point) => sum + point.attendees, 0)
  const totalVolunteers = points.reduce((sum, point) => sum + point.volunteers, 0)

  return {
    points,
    totalAttendees,
    totalVolunteers,
    sessionCount: points.length,
    averageAttendance: points.length > 0 ? totalAttendees / points.length : 0,
  }
}
