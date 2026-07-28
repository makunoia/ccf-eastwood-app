import type { PrismaClient } from "@/app/generated/prisma/client"

/**
 * Attendance breakdown for an event — CCF-92.
 *
 * Splits the people who actually attended into:
 *   - first-timers (no Member record yet) vs members
 *   - of the members: already in a DGroup vs not
 * grouped by Life Stage.
 *
 * "Member" is evaluated on *current* identity, not identity at check-in time:
 * a guest promoted to a Member (e.g. through Catch Mech) counts as a member
 * from then on, which is what makes this report readable as a conversion story.
 *
 * Volunteer check-ins are excluded — like every other attendance figure on the
 * dashboard, this counts participants only.
 */

export const UNSPECIFIED_LIFE_STAGE_LABEL = "Not specified"

export type AttendanceParticipant = {
  registrantId: string
  /** Has a Member record — directly, or via a Guest that was promoted. */
  isMember: boolean
  /** Member is assigned to a DGroup (`Member.smallGroupId`). Always false for first-timers. */
  inSmallGroup: boolean
  lifeStage: { id: string; name: string; order: number } | null
}

export type AttendanceBreakdownRow = {
  /** null for the "Not specified" bucket and for the totals row. */
  lifeStageId: string | null
  lifeStageName: string
  attendees: number
  firstTimers: number
  members: number
  membersInGroup: number
  membersNotInGroup: number
}

export type EventAttendanceBreakdown = {
  rows: AttendanceBreakdownRow[]
  total: AttendanceBreakdownRow
}

function emptyRow(lifeStageId: string | null, lifeStageName: string): AttendanceBreakdownRow {
  return {
    lifeStageId,
    lifeStageName,
    attendees: 0,
    firstTimers: 0,
    members: 0,
    membersInGroup: 0,
    membersNotInGroup: 0,
  }
}

function tally(row: AttendanceBreakdownRow, participant: AttendanceParticipant) {
  row.attendees++
  if (!participant.isMember) {
    row.firstTimers++
    return
  }
  row.members++
  if (participant.inSmallGroup) row.membersInGroup++
  else row.membersNotInGroup++
}

/**
 * Pure aggregation. Rows are ordered by `LifeStage.order` (then name), with the
 * "Not specified" bucket always last, and only emitted when it has attendees.
 */
export function buildAttendanceBreakdown(
  participants: AttendanceParticipant[],
): EventAttendanceBreakdown {
  const byLifeStage = new Map<string, { order: number; row: AttendanceBreakdownRow }>()
  const unspecified = emptyRow(null, UNSPECIFIED_LIFE_STAGE_LABEL)
  const total = emptyRow(null, "All attendees")

  // Guard against the same registrant being passed twice (e.g. multiple
  // occurrence check-ins) — attendance here is per person, not per check-in.
  const seen = new Set<string>()

  for (const participant of participants) {
    if (seen.has(participant.registrantId)) continue
    seen.add(participant.registrantId)

    const stage = participant.lifeStage
    if (stage) {
      let entry = byLifeStage.get(stage.id)
      if (!entry) {
        entry = { order: stage.order, row: emptyRow(stage.id, stage.name) }
        byLifeStage.set(stage.id, entry)
      }
      tally(entry.row, participant)
    } else {
      tally(unspecified, participant)
    }

    tally(total, participant)
  }

  const rows = Array.from(byLifeStage.values())
    .sort((a, b) => a.order - b.order || a.row.lifeStageName.localeCompare(b.row.lifeStageName))
    .map((entry) => entry.row)

  if (unspecified.attendees > 0) rows.push(unspecified)

  return { rows, total }
}

type LifeStageSelection = { id: string; name: string; order: number } | null

function resolveParticipant(registrant: {
  id: string
  member: { smallGroupId: string | null; lifeStage: LifeStageSelection } | null
  guest: {
    lifeStage: LifeStageSelection
    member: { smallGroupId: string | null; lifeStage: LifeStageSelection } | null
  } | null
}): AttendanceParticipant {
  const member = registrant.member ?? registrant.guest?.member ?? null
  return {
    registrantId: registrant.id,
    isMember: member !== null,
    inSmallGroup: member?.smallGroupId != null,
    // The member record wins once it carries a life stage; otherwise fall back
    // to whatever the guest reported at registration.
    lifeStage: member?.lifeStage ?? registrant.guest?.lifeStage ?? null,
  }
}

/**
 * Loads the attendance breakdown for one event, bounded by the dashboard's
 * rolling period window.
 *
 * OneTime events record attendance on `EventRegistrant.attendedAt`; MultiDay and
 * Recurring events record it per occurrence via `OccurrenceAttendee`. Either way
 * a person is counted once, no matter how many sessions they attended.
 */
export async function loadEventAttendanceBreakdown(
  db: PrismaClient,
  eventId: string,
  eventType: "OneTime" | "MultiDay" | "Recurring",
  periodStart: Date,
  periodEnd: Date,
): Promise<EventAttendanceBreakdown> {
  const lifeStageSelect = { select: { id: true, name: true, order: true } } as const
  const registrantSelect = {
    id: true,
    member: { select: { smallGroupId: true, lifeStage: lifeStageSelect } },
    guest: {
      select: {
        lifeStage: lifeStageSelect,
        member: { select: { smallGroupId: true, lifeStage: lifeStageSelect } },
      },
    },
  } as const

  if (eventType === "OneTime") {
    const registrants = await db.eventRegistrant.findMany({
      where: { eventId, attendedAt: { gte: periodStart, lte: periodEnd } },
      select: registrantSelect,
    })
    return buildAttendanceBreakdown(registrants.map(resolveParticipant))
  }

  const attendances = await db.occurrenceAttendee.findMany({
    where: {
      // Participant attendance only — volunteer check-ins carry a null registrantId.
      registrantId: { not: null },
      occurrence: { eventId, date: { gte: periodStart, lte: periodEnd } },
    },
    distinct: ["registrantId"],
    select: { registrant: { select: registrantSelect } },
  })

  return buildAttendanceBreakdown(
    attendances
      .map((attendance) => attendance.registrant)
      .filter((registrant): registrant is NonNullable<typeof registrant> => registrant !== null)
      .map(resolveParticipant),
  )
}
