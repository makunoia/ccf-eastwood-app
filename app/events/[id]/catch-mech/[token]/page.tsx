import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CatchMechConfirmClient } from "./catch-mech-confirm-client"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { resolveCatchMechTargets } from "@/lib/catch-mech/targets"

export const metadata: Metadata = {
  title: { absolute: "Confirm Attendance" },
}

export async function getSessionData(token: string) {
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
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      breakoutGroup: {
        select: {
          name: true,
          facilitatorId: true,
          linkedSmallGroup: { select: { id: true, name: true } },
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

  // Resolve the acting faci's destinations exactly as submitCatchMechConfirmations
  // does — so rejections stay scoped per faci and the picker offers only groups the
  // server will accept.
  const { candidates } = resolveCatchMechTargets(session)
  const isTimothy = candidates.length === 0
  const candidateIds = new Set(candidates.map((g) => g.id))

  // Collect IDs for a batch lookup of existing SmallGroupMemberRequests
  const guestIds = session.breakoutGroup.members
    .map((m) => m.registrant.guestId)
    .filter((id): id is string => id !== null)
  const memberIds = session.breakoutGroup.members
    .map((m) => m.registrant.memberId)
    .filter((id): id is string => id !== null)

  // Each facilitator decides independently — see hidesPerson below for the scoping.
  const existingRequests =
    guestIds.length > 0 || memberIds.length > 0
      ? await db.smallGroupMemberRequest.findMany({
          where: {
            status: { in: ["Confirmed", "Rejected"] },
            OR: [
              ...(guestIds.length > 0 ? [{ guestId: { in: guestIds } }] : []),
              ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
            ],
          },
          select: {
            guestId: true,
            memberId: true,
            status: true,
            smallGroupId: true,
            declinedByVolunteerId: true,
          },
        })
      : []

  const hidesPerson = (r: {
    status: string
    smallGroupId: string | null
    declinedByVolunteerId: string | null
  }) => {
    // A confirmation places the person (one group per person) — hidden from everyone.
    if (r.status === "Confirmed") return true
    if (r.status !== "Rejected") return false
    // A group-bound decline only clears the person from that group's own list, so a
    // co-faci can still confirm someone the lead declined.
    if (r.smallGroupId) return candidateIds.has(r.smallGroupId)
    // A groupless decline has no group to compare — scope it to the faci who made it.
    return r.declinedByVolunteerId === session.facilitatorVolunteerId
  }

  const resolvedGuestIds = new Set(
    existingRequests.filter((r) => r.guestId && hidesPerson(r)).map((r) => r.guestId!)
  )
  const resolvedMemberIds = new Set(
    existingRequests.filter((r) => r.memberId && hidesPerson(r)).map((r) => r.memberId!)
  )

  type RegistrantRow = {
    registrantId: string
    name: string
    type: "member" | "guest"
  }

  const rows: RegistrantRow[] = []
  for (const m of session.breakoutGroup.members) {
    const r = m.registrant
    // Skip anonymous registrants
    if (!r.memberId && !r.guestId) continue
    // Skip already-promoted guests
    if (r.guestId && r.guest?.memberId) continue
    // Skip members already placed in any small group
    if (r.memberId && r.member?.smallGroupId) continue
    // Skip anyone already resolved (confirmed or rejected) in any group
    if (r.guestId && resolvedGuestIds.has(r.guestId)) continue
    if (r.memberId && resolvedMemberIds.has(r.memberId)) continue

    let name = "Unknown"
    let type: "member" | "guest" = "guest"

    if (r.memberId && r.member) {
      name = `${r.member.firstName} ${r.member.lastName}`
      type = "member"
    } else if (r.guestId && r.guest) {
      name = `${r.guest.firstName} ${r.guest.lastName}`
      type = "guest"
    }

    rows.push({ registrantId: r.id, name, type })
  }

  return {
    token,
    event: session.event,
    groupName: session.breakoutGroup.name,
    faciName: `${faciMember.firstName} ${faciMember.lastName}`,
    isTimothy,
    candidates,
    rows,
  }
}

export default async function CatchMechConfirmPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>
}) {
  const { id, token } = await params
  const data = await getSessionData(token)
  if (!data) notFound()

  const formConfig = await getFormConfig("CatchMech", id)
  if (!formConfig.isOpen) return <FormClosed />

  const brand = resolveEventBrand(data.event)
  const theme = resolveFormTheme(formConfig, {
    title: null,
    description: null,
    logoUrl: brand.logoUrl,
    bannerUrl: data.event.registrationPageBannerUrl ?? null,
    primaryColor: brand.primaryColor,
  })
  const logoUrl = theme.logoUrl
  const primaryColor = theme.primaryColor
  const bannerUrl = theme.bannerUrl
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
            candidates={data.candidates}
            rows={data.rows}
          />
        </div>
      </div>
    </div>
  )
}
