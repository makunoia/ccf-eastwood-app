type AttendanceRef = {
  occurrenceId: string
  occurrence: { date: Date }
}

export function isReturner(
  attendances: AttendanceRef[],
  currentOccurrenceId: string,
  currentDate: Date,
): boolean {
  return attendances.some(
    (a) => a.occurrenceId !== currentOccurrenceId && a.occurrence.date < currentDate,
  )
}

// Whether an attendee should be treated as established (i.e. NOT tagged "New").
// Members are established by definition — only first-time guests count as New.
export function isEstablishedAttendee(
  isMember: boolean,
  attendances: AttendanceRef[],
  currentOccurrenceId: string,
  currentDate: Date,
): boolean {
  return isMember || isReturner(attendances, currentOccurrenceId, currentDate)
}

// The badge shown on the session detail page. An admin can pin the status on the
// attendance row itself (OccurrenceAttendee.isReturnerOverride) — a guest who
// attended before the church started recording sessions would otherwise read
// "New" forever. A null/absent override falls back to the derived value.
export function resolveAttendeeStatus(
  override: boolean | null | undefined,
  isMember: boolean,
  attendances: AttendanceRef[],
  currentOccurrenceId: string,
  currentDate: Date,
): boolean {
  return override ?? isEstablishedAttendee(isMember, attendances, currentOccurrenceId, currentDate)
}
