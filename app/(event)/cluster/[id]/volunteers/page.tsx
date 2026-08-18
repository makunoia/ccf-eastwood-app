import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { getClusterVolunteerPool } from "@/lib/clusters/aggregate"
import { ClusterVolunteersTable } from "./volunteers-table"

export const metadata: Metadata = {
  title: "Volunteers",
}

/**
 * The collab day's serving team.
 *
 * Two lists, and which one is the default matters. **This day** — the default —
 * is who signed up through the day's own volunteer form, the answer to "who is
 * serving on Saturday". **All rosters** is the union of the member events'
 * standing teams, which is who has ever volunteered under either ministry; on a
 * long-running ministry event that is hundreds of people who made no statement
 * about this day, and showing it as the day's team was the reason the day's
 * staffing could not be tracked at all.
 *
 * Rows stay owned by the event each person signed up under in both lists, and the
 * table says which: a person's decision to serve was made about a *ministry*.
 * That is the difference from breakouts, where the day owns its own tables.
 *
 * The union has a real use and keeps it: any confirmed volunteer of either
 * ministry may run any of the day's breakout tables, so `setFacilitator` and the
 * carried-over tables' facilitators still draw from it.
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
  const scope = sp.scope === "all" ? "all" : "day"

  const [session, cluster] = await Promise.all([
    auth(),
    db.eventCluster.findUnique({
      where: { id },
      select: { id: true, name: true, kind: true, volunteerIsOpen: true },
    }),
  ])
  if (!cluster) notFound()
  // A Parallel day's events each keep their own serving team; there is no pooled
  // roster to show, and pretending otherwise would imply a sharing that isn't real.
  if (cluster.kind !== ClusterKind.Collab) notFound()

  const { volunteers, committees, events, dayCount, allCount } =
    await getClusterVolunteerPool(session, id, {
      search,
      status,
      committeeId,
      scope,
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

  const base = `/cluster/${id}/volunteers`
  const tabs = [
    { key: "day" as const, label: "This day", href: base, count: dayCount },
    { key: "all" as const, label: "All rosters", href: `${base}?scope=all`, count: allCount },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Volunteers"
        description="Who signed up to serve on this day, through the day's own volunteer form"
      />

      {/* Plain links rather than a client control: the scope is a URL fact, so it
          survives a refresh and can be sent to someone. */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            asChild
            size="sm"
            variant={scope === tab.key ? "secondary" : "ghost"}
          >
            <Link href={tab.href} aria-current={scope === tab.key ? "page" : undefined}>
              {tab.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{tab.count}</span>
            </Link>
          </Button>
        ))}
      </div>

      <ClusterVolunteersTable
        rows={rows}
        committees={committees}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        canEdit={canWrite(session, "Events")}
        scope={scope}
        formIsOpen={cluster.volunteerIsOpen}
      />
    </div>
  )
}
