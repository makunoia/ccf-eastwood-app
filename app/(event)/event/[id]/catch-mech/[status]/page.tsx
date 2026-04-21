import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { StatusListClient, type StatusListRow } from "./status-list-client"

const VALID_STATUSES = ["confirmed", "rejected", "pending"] as const
type Status = (typeof VALID_STATUSES)[number]

const STATUS_PRISMA: Record<Status, "Confirmed" | "Rejected" | "Pending"> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}

async function getStatusListData(eventId: string, status: Status) {
  const prismaStatus = STATUS_PRISMA[status]

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
      smallGroup: { select: { name: true } },
      breakoutGroupId: true,
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

  const breakoutGroupNameMap = new Map(
    event.breakoutGroups.map((bg) => [bg.id, bg.name])
  )

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
