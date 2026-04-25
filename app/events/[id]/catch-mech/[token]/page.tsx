import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CatchMechConfirmClient } from "./catch-mech-confirm-client"

async function getSessionData(token: string) {
  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      breakoutGroupId: true,
      facilitator: {
        select: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              groupStatus: true,
              ledGroups: {
                select: { id: true, name: true },
                take: 1,
              },
            },
          },
        },
      },
      breakoutGroup: {
        select: {
          name: true,
          members: {
            orderBy: { assignedAt: "asc" },
            select: {
              registrantId: true,
              assignedAt: true,
              registrant: {
                select: {
                  id: true,
                  memberId: true,
                  guestId: true,
                  member: { select: { id: true, firstName: true, lastName: true, smallGroupId: true } },
                  guest: { select: { id: true, firstName: true, lastName: true, memberId: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!session) return null

  const faciMember = session.facilitator.member
  const isTimothy = faciMember.ledGroups.length === 0
  const leadingGroupId = isTimothy ? null : faciMember.ledGroups[0].id

  // Collect IDs for a batch lookup of existing SmallGroupMemberRequests
  const guestIds = session.breakoutGroup.members
    .map((m) => m.registrant.guestId)
    .filter((id): id is string => id !== null)
  const memberIds = session.breakoutGroup.members
    .map((m) => m.registrant.memberId)
    .filter((id): id is string => id !== null)

  // Batch-fetch Confirmed/Rejected requests to avoid N+1 and to filter out rejected registrants
  const existingRequests = leadingGroupId
    ? await db.smallGroupMemberRequest.findMany({
        where: {
          smallGroupId: leadingGroupId,
          status: { in: ["Confirmed", "Rejected"] },
          OR: [
            ...(guestIds.length > 0 ? [{ guestId: { in: guestIds } }] : []),
            ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
          ],
        },
        select: { guestId: true, memberId: true, status: true },
      })
    : []

  const rejectedGuestIds = new Set(
    existingRequests
      .filter((r) => r.status === "Rejected" && r.guestId)
      .map((r) => r.guestId!)
  )
  const confirmedGuestIds = new Set(
    existingRequests
      .filter((r) => r.status === "Confirmed" && r.guestId)
      .map((r) => r.guestId!)
  )
  const rejectedMemberIds = new Set(
    existingRequests
      .filter((r) => r.status === "Rejected" && r.memberId)
      .map((r) => r.memberId!)
  )

  type RegistrantRow = {
    registrantId: string
    name: string
    type: "member" | "guest"
    isConfirmed: boolean
  }

  const rows: RegistrantRow[] = []
  for (const m of session.breakoutGroup.members) {
    const r = m.registrant
    // Skip anonymous registrants
    if (!r.memberId && !r.guestId) continue
    // Skip already-promoted guests
    if (r.guestId && r.guest?.memberId) continue
    // Skip registrants that were previously rejected for the faci's leading group
    if (r.guestId && rejectedGuestIds.has(r.guestId)) continue
    if (r.memberId && rejectedMemberIds.has(r.memberId)) continue

    let name = "Unknown"
    let isConfirmed = false
    let type: "member" | "guest" = "guest"

    if (r.memberId && r.member) {
      name = `${r.member.firstName} ${r.member.lastName}`
      type = "member"
      isConfirmed = leadingGroupId !== null && r.member.smallGroupId === leadingGroupId
    } else if (r.guestId && r.guest) {
      name = `${r.guest.firstName} ${r.guest.lastName}`
      type = "guest"
      isConfirmed = leadingGroupId !== null && confirmedGuestIds.has(r.guestId)
    }

    rows.push({ registrantId: r.id, name, type, isConfirmed })
  }

  return {
    token,
    groupName: session.breakoutGroup.name,
    faciName: `${faciMember.firstName} ${faciMember.lastName}`,
    isTimothy,
    rows,
  }
}

export default async function CatchMechConfirmPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>
}) {
  const { token } = await params
  const data = await getSessionData(token)
  if (!data) notFound()

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            {data.isTimothy ? "Timothy" : "Leader"} · {data.groupName}
          </p>
          <h1 className="text-xl font-bold">Hi, {data.faciName}!</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Review the people from your table. Confirm who will join your small group, mark others as pending, or decline with a reason.
          </p>
        </div>
        <CatchMechConfirmClient
          token={data.token}
          groupName={data.groupName}
          isTimothy={data.isTimothy}
          rows={data.rows}
        />
      </div>
    </div>
  )
}
