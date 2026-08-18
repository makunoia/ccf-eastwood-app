import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { db } from "@/lib/db"
import { ClusterKind } from "@/app/generated/prisma/client"
import { PageHeader } from "@/components/page-header"
import { clusterVolunteerPath } from "@/lib/public-routes"
import { ClusterVolunteerAccess } from "./volunteer-access"

export const metadata: Metadata = {
  title: "Volunteer Sign-Up",
}

export default async function ClusterVolunteerFormPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: {
      id: true,
      publicToken: true,
      kind: true,
      volunteerIsOpen: true,
      events: {
        orderBy: { order: "asc" },
        select: {
          event: {
            select: {
              id: true,
              name: true,
              _count: { select: { committees: true } },
            },
          },
        },
      },
    },
  })
  if (!cluster) notFound()
  // Collab-only, like the day's Volunteers screen: a Parallel day's events each
  // recruit their own team through their own form, and there is no shared roster
  // for a shared form to feed.
  if (cluster.kind !== ClusterKind.Collab) notFound()

  // The form asks which ministry you're part of and then offers that ministry's
  // committees. An event with none has nothing to offer, and a volunteer who
  // picks it reaches a dead end — so it is said here, before the link goes out.
  const withoutCommittees = cluster.events
    .filter((ce) => ce.event._count.committees === 0)
    .map((ce) => ce.event.name)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/cluster/${id}/forms`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Forms
        </Link>
        <PageHeader
          title="Volunteer Sign-Up"
          description="One sign-up form for the day — it asks which ministry you're part of, then that ministry's committees and roles"
        />
      </div>

      <ClusterVolunteerAccess
        clusterId={id}
        publicPath={clusterVolunteerPath(cluster.publicToken)}
        initialIsOpen={cluster.volunteerIsOpen}
      />

      {withoutCommittees.length > 0 && (
        <div className="max-w-2xl rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No committees set up yet for {withoutCommittees.join(" or ")}. Anyone
          picking that ministry will have nothing to choose from — add committees
          and roles on the event&apos;s Volunteers screen first.
        </div>
      )}
    </div>
  )
}
