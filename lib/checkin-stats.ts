// Pure attendance derivation for the OneTime admin Check-in screen.
//
// A OneTime event behaves like a single Day/Session, but attendance is recorded
// on `EventRegistrant.attendedAt` / `Volunteer.attendedAt` rather than via
// OccurrenceAttendee. This mirrors the stat derivation of the session detail page
// (lib/session-stats.ts semantics): members and volunteers are "established", so
// only first-time guests are tagged "New". With a single date there is no
// occurrence history, so a non-member/non-volunteer registrant is always "New".

type Gender = "Male" | "Female" | null

export type CheckinRegistrantInput = {
  id: string
  memberId: string | null
  member: { firstName: string; lastName: string; gender: Gender } | null
  guest: { firstName: string; lastName: string; gender: Gender } | null
  firstName: string | null
  lastName: string | null
  attendedAt: Date
}

export type CheckinVolunteerInput = {
  id: string
  memberId: string | null
  member: { firstName: string; lastName: string; gender: Gender }
  attendedAt: Date
}

export type CheckinAttendeeRow = {
  id: string
  kind: "registrant" | "volunteer"
  subjectId: string
  name: string | null
  checkedInAtFormatted: string
  isReturner: boolean
  isMember: boolean
  isVolunteer: boolean
  gender: Gender
}

export type CheckinStats = {
  rows: CheckinAttendeeRow[]
  totalCount: number
  newCount: number
  participantCount: number
  volunteersPresent: number
  menCount: number
  womenCount: number
}

function registrantName(r: CheckinRegistrantInput): string | null {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || null
}

function formatCheckedInAt(date: Date): string {
  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
}

export function buildCheckinStats(
  registrants: CheckinRegistrantInput[],
  volunteers: CheckinVolunteerInput[],
  // Member ids of every Volunteer for this event — used to flag a registrant who
  // is also a volunteer so they are counted as a volunteer, not a new guest.
  volunteerMemberIds: Set<string>,
): CheckinStats {
  // Volunteer attendance rows are authoritative. Track their member ids so a
  // registrant for the same person isn't double-counted.
  const volunteerRows: CheckinAttendeeRow[] = []
  // Member ids already represented by a volunteer attendance row — used to skip a
  // duplicate registrant row for the same person.
  const volunteerAttendedMemberIds = new Set<string>()
  for (const v of volunteers) {
    if (v.memberId) volunteerAttendedMemberIds.add(v.memberId)
    volunteerRows.push({
      id: `volunteer:${v.id}`,
      kind: "volunteer",
      subjectId: v.id,
      name: `${v.member.firstName} ${v.member.lastName}`.trim() || null,
      checkedInAtFormatted: formatCheckedInAt(v.attendedAt),
      // Volunteers are established — never "New".
      isReturner: true,
      isMember: true,
      isVolunteer: true,
      gender: v.member.gender,
    })
  }

  const registrantRows: CheckinAttendeeRow[] = registrants
    .filter((r) => !(r.memberId && volunteerAttendedMemberIds.has(r.memberId)))
    .map((r): CheckinAttendeeRow => {
      const isVolunteer = r.memberId ? volunteerMemberIds.has(r.memberId) : false
      const isMember = !!r.memberId
      return {
        id: `registrant:${r.id}`,
        kind: "registrant",
        subjectId: r.id,
        name: registrantName(r),
        checkedInAtFormatted: formatCheckedInAt(r.attendedAt),
        // Members and volunteers are established; only first-time guests are New.
        isReturner: isMember || isVolunteer,
        isMember,
        isVolunteer,
        gender: r.member?.gender ?? r.guest?.gender ?? null,
      }
    })

  const rows = [...volunteerRows, ...registrantRows].sort((a, b) => {
    // New attendees first, then alphabetical by name.
    if (a.isReturner !== b.isReturner) return a.isReturner ? 1 : -1
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  })

  const totalCount = rows.length
  const volunteersPresent = rows.filter((r) => r.isVolunteer).length
  const newCount = rows.filter((r) => !r.isReturner).length
  const participantCount = totalCount - volunteersPresent
  const menCount = rows.filter((r) => r.gender === "Male").length
  const womenCount = rows.filter((r) => r.gender === "Female").length

  return {
    rows,
    totalCount,
    newCount,
    participantCount,
    volunteersPresent,
    menCount,
    womenCount,
  }
}
