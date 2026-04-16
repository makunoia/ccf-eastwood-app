export type GuestPipelineStatus = "New" | "EventAttendee" | "Matched" | "Pending" | "Member"

export function computeGuestStatus(g: {
  memberId: string | null
  hasPendingSmallGroupRequest: boolean
  eventRegistrations: {
    attendedAt: Date | null
    occurrenceAttendances: { id: string }[]
    breakoutGroupMemberships: { breakoutGroupId: string }[]
  }[]
}): GuestPipelineStatus {
  if (g.memberId !== null) return "Member"
  if (g.hasPendingSmallGroupRequest) return "Pending"

  for (const r of g.eventRegistrations) {
    if (r.breakoutGroupMemberships.length > 0) return "Matched"
  }

  for (const r of g.eventRegistrations) {
    if (r.attendedAt !== null || r.occurrenceAttendances.length > 0) return "EventAttendee"
  }

  return "New"
}
