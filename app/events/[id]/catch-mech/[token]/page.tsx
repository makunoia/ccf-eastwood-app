import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CatchMechConfirmClient } from "./catch-mech-confirm-client"

async function getSessionData(token: string) {
  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      breakoutGroupId: true,
      facilitatorVolunteerId: true,
      event: {
        select: {
          name: true,
          useMinistryBrand: true,
          brandMinistryId: true,
          logoUrl: true,
          themeColorPrimary: true,
          registrationPageBannerUrl: true,
          ministries: {
            select: {
              ministry: {
                select: {
                  id: true,
                  logoUrl: true,
                  themeColorPrimary: true,
                },
              },
            },
          },
        },
      },
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
              },
            },
          },
        },
      },
      breakoutGroup: {
        select: {
          name: true,
          linkedSmallGroupId: true,
          facilitatorId: true,
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
  // Mirror the submit action's target resolution. The breakout's link belongs to the
  // LEAD facilitator, so a co-facilitator resolves to their own led group instead.
  const isLeadFaci = session.facilitatorVolunteerId === session.breakoutGroup.facilitatorId
  const effectiveLink = isLeadFaci ? session.breakoutGroup.linkedSmallGroupId : null
  const leadingGroupId =
    effectiveLink ??
    (faciMember.ledGroups.length === 1 ? faciMember.ledGroups[0].id : null)

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
    event: session.event,
    groupName: session.breakoutGroup.name,
    faciName: `${faciMember.firstName} ${faciMember.lastName}`,
    isTimothy,
    rows,
  }
}

function resolveEventBrand(event: NonNullable<Awaited<ReturnType<typeof getSessionData>>>["event"]) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return {
      logoUrl: ministry?.ministry.logoUrl ?? null,
      primaryColor: ministry?.ministry.themeColorPrimary ?? null,
    }
  }
  return {
    logoUrl: event.logoUrl ?? null,
    primaryColor: event.themeColorPrimary ?? null,
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

  const { logoUrl, primaryColor } = resolveEventBrand(data.event)
  const bannerUrl = data.event.registrationPageBannerUrl ?? null
  const hasBg = !!(bannerUrl || primaryColor)

  return (
    <div className="relative min-h-svh bg-muted">
      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}

      {/* Branded header band */}
      <div
        className="relative px-6 pt-8 pb-16 text-center"
        style={!bannerUrl && primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        <div className="relative mx-auto w-full max-w-md space-y-2">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={data.event.name}
              className="mx-auto mb-4 size-20 rounded-xl object-contain"
              style={hasBg ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
            />
          )}
          <p className={`text-xs uppercase tracking-widest font-medium ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
            {data.isTimothy ? "Timothy" : "Leader"} · {data.groupName}
          </p>
          <h1 className={`text-2xl font-bold ${hasBg ? "text-white" : ""}`}>Hi, {data.faciName}!</h1>
          <p className={`text-sm leading-relaxed ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
            Review the people from your table. Confirm who will join your small group, mark others as pending, or decline with a reason.
          </p>
        </div>
      </div>

      {/* Form area */}
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <CatchMechConfirmClient
            token={data.token}
            groupName={data.groupName}
            isTimothy={data.isTimothy}
            rows={data.rows}
          />
        </div>
      </div>
    </div>
  )
}
