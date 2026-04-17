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
      // For guests: confirmed if there's a resolved request for faci's group
      if (leadingGroupId) {
        const req = await db.smallGroupMemberRequest.findFirst({
          where: { guestId: r.guestId, smallGroupId: leadingGroupId, status: "Confirmed" },
          select: { id: true },
        })
        isConfirmed = !!req
      }
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
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {data.isTimothy ? "Timothy" : "Leader"} · {data.groupName}
          </p>
          <h1 className="text-lg font-semibold">Hi, {data.faciName}!</h1>
          <p className="text-sm text-muted-foreground">
            Confirm the members from your table who will be joining your small group.
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
