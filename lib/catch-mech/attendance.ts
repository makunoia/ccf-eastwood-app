import type { EventType } from "@/app/generated/prisma/client"

export type CatchMechAttendance = {
  sessionsAttended: number
  returnCount: number
  attendanceRate: number | null
  signedUpAt: string
  lastAttendedAt: string | null
  oneTime: boolean
}

export type AttendanceRegistration = {
  id: string
  memberId: string | null
  guestId: string | null
  createdAt: Date
  attendedAt: Date | null
  guest?: { memberId: string | null } | null
  occurrenceAttendances: { occurrenceId: string; occurrence: { date: Date } }[]
}

export function manilaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date)
}

export function attendancePersonKey(row: Pick<AttendanceRegistration, "id" | "memberId" | "guestId" | "guest">): string {
  const memberId = row.memberId ?? row.guest?.memberId
  return memberId ? `member:${memberId}` : row.guestId ? `guest:${row.guestId}` : `registrant:${row.id}`
}

/** Session dates are stored at UTC midnight, not as Manila instants. */
export function sessionDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildCatchMechAttendance(
  type: EventType,
  registrations: AttendanceRegistration[],
  occurrences: { id: string; date: Date }[],
  now = new Date(),
): Map<string, CatchMechAttendance> {
  const today = manilaDate(now)
  const occurrenceDates = new Map(occurrences.map((occurrence) => [occurrence.id, sessionDate(occurrence.date)]))
  const people = new Map<string, AttendanceRegistration[]>()
  for (const row of registrations) {
    const key = attendancePersonKey(row)
    const existing = people.get(key)
    if (existing) existing.push(row)
    else people.set(key, [row])
  }
  const result = new Map<string, CatchMechAttendance>()
  for (const rows of people.values()) {
    const signup = rows.reduce((earliest, row) => row.createdAt < earliest ? row.createdAt : earliest, rows[0].createdAt)
    const signupDate = manilaDate(signup)
    const visits = new Map(rows.flatMap((row) => row.occurrenceAttendances)
      .filter((visit) => occurrenceDates.has(visit.occurrenceId) && occurrenceDates.get(visit.occurrenceId)! <= today)
      .map((visit) => [visit.occurrenceId, occurrenceDates.get(visit.occurrenceId)!]))
    const oneTime = type === "OneTime"
    const oneTimeDates = rows.flatMap((row) => row.attendedAt && manilaDate(row.attendedAt) <= today ? [row.attendedAt.toISOString()] : [])
    const window = occurrences.filter((occurrence) => {
      const date = sessionDate(occurrence.date)
      return date >= signupDate && date < today
    })
    const sessionsAttended = oneTime ? Number(oneTimeDates.length > 0) : visits.size
    const summary: CatchMechAttendance = {
      oneTime,
      sessionsAttended,
      returnCount: oneTime ? 0 : Math.max(sessionsAttended - 1, 0),
      attendanceRate: !oneTime && window.length ? window.filter((occurrence) => visits.has(occurrence.id)).length / window.length : null,
      signedUpAt: signup.toISOString(),
      lastAttendedAt: oneTime ? oneTimeDates.sort().at(-1) ?? null : [...visits.values()].sort().at(-1) ?? null,
    }
    for (const row of rows) result.set(row.id, summary)
  }
  return result
}
