export type SessionAttendeeView = {
  name: string | null
  isReturner: boolean
  breakoutGroupNames: string[]
}

export type AttendeeSortDirection = "asc" | "desc"

export function getBreakoutAssignmentLabel(attendee: SessionAttendeeView): string {
  return attendee.breakoutGroupNames.join(", ") || "Unassigned"
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" })
}

export function sortSessionAttendees<T extends SessionAttendeeView>(
  attendees: T[],
  statusSortDirection: AttendeeSortDirection,
): T[] {
  const direction = statusSortDirection === "asc" ? 1 : -1

  return [...attendees].sort((left, right) => {
    const statusComparison = compareText(
      left.isReturner ? "Returning" : "New",
      right.isReturner ? "Returning" : "New",
    )

    if (statusComparison !== 0) return statusComparison * direction

    const breakoutComparison = compareText(
      getBreakoutAssignmentLabel(left),
      getBreakoutAssignmentLabel(right),
    )

    if (breakoutComparison !== 0) return breakoutComparison

    return compareText(left.name ?? "", right.name ?? "")
  })
}
