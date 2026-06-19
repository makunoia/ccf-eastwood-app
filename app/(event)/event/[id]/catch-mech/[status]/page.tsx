import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { formatDeclineReason } from "@/lib/decline-reason"
import { StatusListClient, type StatusListRow } from "./status-list-client"

const VALID_STATUSES = ["confirmed", "rejected", "pending"] as const
type Status = (typeof VALID_STATUSES)[number]

const STATUS_PRISMA: Record<Status, "Confirmed" | "Rejected" | "Pending"> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}

async function getStatusListData(eventId: string, status: Status) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  })
  if (!event) return null

  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)
  const breakoutGroupNameMap = new Map(
    event.breakoutGroups.map((bg) => [bg.id, bg.name])
  )

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
    for (const m of breakoutMembers) {
      const r = m.registrant
      if (!r.memberId && !r.guestId) continue
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

    return { rows, breakoutGroups: event.breakoutGroups }
  }

  const prismaStatus = STATUS_PRISMA[status]

  const requests = await db.smallGroupMemberRequest.findMany({
    where: {
      status: prismaStatus,
      breakoutGroupId: { in: breakoutGroupIds },
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
      breakoutGroupName: breakoutGroupNameMap.get(req.breakoutGroupId ?? "") ?? "—",
      smallGroupName: req.smallGroup?.name ?? null,
      declineReason: formatDeclineReason(req.declineReason, req.notes),
      rejectedByName: req.smallGroup?.leader
        ? `${req.smallGroup.leader.firstName} ${req.smallGroup.leader.lastName}`
        : null,
    }]
  })

  return { rows, breakoutGroups: event.breakoutGroups }
}

export default async function StatusListPage({
  params,
}: {
  params: Promise<{ id: string; status: string }>
}) {
  const { id: eventId, status: rawStatus } = await params

  if (!VALID_STATUSES.includes(rawStatus as Status)) {
    notFound()
  }

  const status = rawStatus as Status
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
