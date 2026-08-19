import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { formatDeclineReason } from "@/lib/decline-reason"
import { personKeyFor } from "@/lib/clusters/roster"
import {
  VOLUNTEER_CHANNEL_LABEL,
  getVolunteerPlacementRequestIds,
} from "@/lib/catch-mech/volunteer-requests"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"
import { StatusListClient, type StatusListRow } from "./status-list-client"
import { SLUG_CONFIG, isCatchMechSlug, type CatchMechSlug } from "../status-slug"

/**
 * The filter dropdown is keyed by the column's text, so the volunteer channel
 * needs an entry of its own or those rows become unfilterable.
 */
function pendingGroupOptions(
  breakoutGroups: { id: string; name: string }[],
  rows: StatusListRow[]
): { id: string; name: string }[] {
  return rows.some((row) => row.breakoutGroupName === VOLUNTEER_CHANNEL_LABEL)
    ? [...breakoutGroups, { id: "volunteer-follow-up", name: VOLUNTEER_CHANNEL_LABEL }]
    : breakoutGroups
}

async function getStatusListData(eventId: string, status: CatchMechSlug) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  })
  if (!event) return null

  // Under a Collab these are the cluster's tables endorsed to this event via
  // their facilitator, not the event's own — see `lib/catch-mech/scope.ts`.
  const scope = await resolveCatchMechScope(eventId)
  const eventBreakoutGroups = await db.breakoutGroup.findMany({
    where: scope.where,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  const breakoutGroupIds = eventBreakoutGroups.map((bg) => bg.id)
  const breakoutGroupNameMap = new Map(eventBreakoutGroups.map((bg) => [bg.id, bg.name]))

  if (status === "pending") {
    // Derive pending rows from breakout group members directly: every breakout
    // member who isn't already in a small group and doesn't have a
    // Confirmed/Rejected request is implicitly pending — no facilitator
    // submission required.
    const [breakoutMembers, resolvedRequests] = await Promise.all([
      db.breakoutGroupMember.findMany({
        where: { breakoutGroupId: { in: breakoutGroupIds } },
        select: {
          breakoutGroupId: true,
          breakoutGroup: {
            select: {
              linkedSmallGroup: { select: { name: true } },
            },
          },
          registrant: {
            select: {
              id: true,
              memberId: true,
              guestId: true,
              member: {
                select: { firstName: true, lastName: true, smallGroupId: true },
              },
              guest: {
                select: { firstName: true, lastName: true, memberId: true },
              },
            },
          },
        },
      }),
      db.smallGroupMemberRequest.findMany({
        where: {
          breakoutGroupId: { in: breakoutGroupIds },
          status: { in: ["Confirmed", "Rejected"] },
        },
        select: { breakoutGroupId: true, memberId: true, guestId: true },
      }),
    ])

    const resolvedKey = (breakoutGroupId: string | null, memberId: string | null, guestId: string | null) =>
      `${breakoutGroupId ?? ""}|${memberId ?? ""}|${guestId ?? ""}`
    const resolvedSet = new Set(
      resolvedRequests.map((r) => resolvedKey(r.breakoutGroupId, r.memberId, r.guestId))
    )

    const rows: StatusListRow[] = []
    // Same one-row-per-person rule the dashboard aggregation uses, so the Pending
    // count on the card and the length of this list agree. A duplicate sign-up
    // seats the same human twice.
    const countedPeople = new Set<string>()
    for (const m of breakoutMembers) {
      const r = m.registrant
      if (!r.memberId && !r.guestId) continue
      const personKey = personKeyFor(r)
      if (countedPeople.has(personKey)) continue
      // Already in a small group — no longer pending in catch mech
      if (r.memberId && r.member?.smallGroupId) continue
      // Guest that's already been promoted to a member elsewhere
      if (r.guestId && r.guest?.memberId) continue
      if (resolvedSet.has(resolvedKey(m.breakoutGroupId, r.memberId, r.guestId))) continue

      let name: string
      let type: "Member" | "Guest"
      if (r.memberId && r.member) {
        name = `${r.member.firstName} ${r.member.lastName}`
        type = "Member"
      } else if (r.guestId && r.guest) {
        name = `${r.guest.firstName} ${r.guest.lastName}`
        type = "Guest"
      } else {
        continue
      }

      countedPeople.add(personKey)
      rows.push({
        requestId: `pending-${r.id}`,
        registrantId: r.id,
        name,
        type,
        breakoutGroupName: breakoutGroupNameMap.get(m.breakoutGroupId) ?? "—",
        smallGroupName: m.breakoutGroup.linkedSmallGroup?.name ?? null,
        declineReason: null,
        rejectedByName: null,
      })
    }

    // A volunteer placement that an admin undid goes back to Pending while keeping
    // its null breakoutGroupId, so the breakout-derived rows above can never reach
    // it. Without this the person drops off every Catch Mech list the moment the
    // decision is reversed — the one state where they most need to be visible.
    const reopened = await db.smallGroupMemberRequest.findMany({
      where: { id: { in: [...(await getVolunteerPlacementRequestIds(eventId))] }, status: "Pending" },
      select: {
        id: true,
        smallGroup: { select: { name: true } },
        member: {
          select: {
            firstName: true,
            lastName: true,
            eventRegistrations: { where: { eventId }, select: { id: true }, take: 1 },
          },
        },
        guest: {
          select: {
            firstName: true,
            lastName: true,
            eventRegistrations: { where: { eventId }, select: { id: true }, take: 1 },
          },
        },
      },
    })

    // Someone seated at a table AND absorbed by a roving volunteer can be reached
    // both ways; the breakout row wins because it names the actual table.
    const seenRegistrants = new Set(rows.map((row) => row.registrantId))
    for (const request of reopened) {
      const person = request.member ?? request.guest
      const registrantId = person?.eventRegistrations[0]?.id
      if (!person || !registrantId || seenRegistrants.has(registrantId)) continue
      seenRegistrants.add(registrantId)
      rows.push({
        requestId: request.id,
        registrantId,
        name: `${person.firstName} ${person.lastName}`,
        type: request.member ? "Member" : "Guest",
        breakoutGroupName: VOLUNTEER_CHANNEL_LABEL,
        smallGroupName: request.smallGroup?.name ?? null,
        declineReason: null,
        rejectedByName: null,
      })
    }

    return { rows, breakoutGroups: pendingGroupOptions(eventBreakoutGroups, rows) }
  }

  const { prismaStatus, declineReasonWhere } = SLUG_CONFIG[status]

  // A volunteer who absorbs someone has no breakout table, so their request rows
  // carry a null breakoutGroupId and the scope below would drop them. They belong
  // in these lists — that is where the per-person detail and Undo live.
  const volunteerRequestIds = await getVolunteerPlacementRequestIds(eventId)

  const requests = await db.smallGroupMemberRequest.findMany({
    where: {
      status: prismaStatus,
      // AND, not a spread: the "rejected" slug's declineReasonWhere is itself an
      // OR, and two OR keys in one object silently overwrite each other.
      AND: [
        {
          OR: [
            { breakoutGroupId: { in: breakoutGroupIds } },
            ...(volunteerRequestIds.size > 0
              ? [{ id: { in: [...volunteerRequestIds] } }]
              : []),
          ],
        },
        // Splits the two Rejected slugs apart. See status-slug.ts — the null-safety
        // there is load-bearing, not cosmetic.
        ...(declineReasonWhere ? [declineReasonWhere] : []),
      ],
    },
    select: {
      id: true,
      guestId: true,
      memberId: true,
      smallGroupId: true,
      smallGroup: {
        select: {
          name: true,
          leader: { select: { firstName: true, lastName: true } },
        },
      },
      breakoutGroupId: true,
      declineReason: true,
      notes: true,
      guest: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          eventRegistrations: {
            where: { eventId },
            select: { id: true },
            take: 1,
          },
        },
      },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          eventRegistrations: {
            where: { eventId },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  })

  const rows: StatusListRow[] = requests.flatMap((req) => {
    let name: string
    let type: "Member" | "Guest"
    let registrantId: string | null = null

    if (req.member) {
      name = `${req.member.firstName} ${req.member.lastName}`
      type = "Member"
      registrantId = req.member.eventRegistrations[0]?.id ?? null
    } else if (req.guest) {
      name = `${req.guest.firstName} ${req.guest.lastName}`
      type = "Guest"
      registrantId = req.guest.eventRegistrations[0]?.id ?? null
    } else {
      return []
    }

    if (!registrantId) return []

    return [{
      requestId: req.id,
      registrantId,
      name,
      type,
      breakoutGroupName: req.breakoutGroupId
        ? (breakoutGroupNameMap.get(req.breakoutGroupId) ?? "—")
        : volunteerRequestIds.has(req.id)
          ? VOLUNTEER_CHANNEL_LABEL
          : "—",
      smallGroupName: req.smallGroup?.name ?? null,
      declineReason: formatDeclineReason(req.declineReason, req.notes),
      rejectedByName: req.smallGroup?.leader
        ? `${req.smallGroup.leader.firstName} ${req.smallGroup.leader.lastName}`
        : null,
    }]
  })

  return { rows, breakoutGroups: pendingGroupOptions(eventBreakoutGroups, rows) }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ status: string }>
}): Promise<Metadata> {
  const { status } = await params
  if (!isCatchMechSlug(status)) return { title: "Catch Mech" }
  return { title: `${SLUG_CONFIG[status].label} · Catch Mech` }
}

export default async function StatusListPage({
  params,
}: {
  params: Promise<{ id: string; status: string }>
}) {
  const { id: eventId, status: rawStatus } = await params

  if (!isCatchMechSlug(rawStatus)) notFound()

  const status = rawStatus
  const data = await getStatusListData(eventId, status)
  if (!data) notFound()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <StatusListClient
        rows={data.rows}
        status={status}
        eventId={eventId}
        breakoutGroups={data.breakoutGroups}
      />
    </div>
  )
}
