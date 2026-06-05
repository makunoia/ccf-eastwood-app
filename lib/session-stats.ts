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
