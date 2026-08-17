import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import { PageHeader } from "@/components/page-header"
import { getClusterVolunteerPool } from "@/lib/clusters/aggregate"
import { ClusterVolunteersTable } from "./volunteers-table"

export const metadata: Metadata = {
  title: "Volunteers",
}

/**
 * The collab day's serving team (CCF-148).
 *
 * A **union**, not a new pool: each volunteer still belongs to the event they
 * signed up under, and the table says which. That is the difference from
 * breakouts, where the day owns its own tables — a person's decision to serve was
 * made about a ministry, so it keeps that provenance, whereas a table on a collab
 * day belongs to the day.
 *
 * The practical payoff is `setFacilitator`: any confirmed volunteer on this list
 * can run any of the day's breakout tables, whichever ministry they came in
 * through.
 */
export default async function ClusterVolunteersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const search = (sp.search as string) || ""
  const status = (sp.status as string) || ""
  const committeeId = (sp.committeeId as string) || ""

  const [session, cluster] = await Promise.all([
    auth(),
    db.eventCluster.findUnique({
      where: { id },
      select: { id: true, name: true, kind: true },
    }),
  ])
  if (!cluster) notFound()
  // A Parallel day's events each keep their own serving team; there is no pooled
  // roster to show, and pretending otherwise would imply a sharing that isn't real.
  if (cluster.kind !== ClusterKind.Collab) notFound()

  const { volunteers, committees, events } = await getClusterVolunteerPool(session, id, {
    search,
    status,
    committeeId,
  })

  // Someone serving on both member events holds two Volunteer rows — there is no
  // unique on (memberId, eventId). Surfaced as a marker rather than deduplicated:
  // two sign-ups is a fact staff want to see, not a defect to hide.
  const countByMember = new Map<string, number>()
  for (const v of volunteers) {
    countByMember.set(v.member.id, (countByMember.get(v.member.id) ?? 0) + 1)
  }

  const rows = volunteers.map((v) => ({
    id: v.id,
    status: v.status,
    notes: v.notes,
    member: v.member,
    event: v.event,
    committee: v.committee,
    preferredRole: v.preferredRole,
    assignedRole: v.assignedRole,
    servingInBoth: (countByMember.get(v.member.id) ?? 0) > 1,
  }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader title="Volunteers" />
      <ClusterVolunteersTable
        rows={rows}
        committees={committees}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        canEdit={canWrite(session, "Events")}
      />
    </div>
  )
}
