export type GuestPipelineStatus = "New" | "EventAttendee" | "Matched" | "Declined" | "Pending" | "Member"

export function computeGuestStatus(g: {
  memberId: string | null
  hasPendingSmallGroupRequest: boolean
  hasRejectedSmallGroupRequest: boolean
  eventRegistrations: {
    attendedAt: Date | null
    occurrenceAttendances: { id: string }[]
    breakoutGroupMemberships: { breakoutGroupId: string }[]
  }[]
}): GuestPipelineStatus {
  if (g.memberId !== null) return "Member"
  if (g.hasPendingSmallGroupRequest) return "Pending"

  for (const r of g.eventRegistrations) {
    if (r.breakoutGroupMemberships.length > 0) {
      return g.hasRejectedSmallGroupRequest ? "Declined" : "Matched"
    }
  }

  if (g.hasRejectedSmallGroupRequest) return "Declined"

  for (const r of g.eventRegistrations) {
    if (r.attendedAt !== null || r.occurrenceAttendances.length > 0) return "EventAttendee"
  }

  return "New"
}
