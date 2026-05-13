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
