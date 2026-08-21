import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { db } from "@/lib/db"
import {
  getClusterFormConfigs,
  getClusterFormSuccessMessages,
} from "@/lib/forms/context-config-server"
import { PageHeader } from "@/components/page-header"
import { EventFormBuilder } from "@/components/forms/event-form-builder"
import { ClusterWalkInAccess } from "./walk-in-access"
import { clusterFormPrerequisites } from "@/lib/forms/form-prerequisites-server"
import {
  clusterNotApplicableToggles,
  clusterOffersBreakoutStep,
} from "@/lib/forms/cluster-sections"
import { clusterWalkInPath } from "@/lib/public-routes"

export const metadata: Metadata = {
  title: "Walk-in Registration",
}

export default async function ClusterWalkInFormPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, publicToken: true, walkInIsOpen: true },
  })
  if (!cluster) notFound()

  const [configs, successMessages, prerequisites] = await Promise.all([
    getClusterFormConfigs(id),
    getClusterFormSuccessMessages(id),
    clusterFormPrerequisites(id, cluster.kind),
  ])

  const offersBreakout = clusterOffersBreakoutStep(cluster.kind)

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
          title="Walk-in Registration"
          description="The registration form in door mode — for staff registering people at the event"
        />
      </div>

      <ClusterWalkInAccess
        clusterId={id}
        publicPath={clusterWalkInPath(cluster.publicToken)}
        initialIsOpen={cluster.walkInIsOpen}
      />

      <EventFormBuilder
        clusterId={id}
        initial={configs}
        contexts={["WalkIn"]}
        heading="Walk-in form"
        blurb={
          offersBreakout
            ? "What someone registering at the door is asked for — configured separately from the public form, so the door version can ask less. Breakout picking here only offers tables whose facilitator has checked in."
            : "What someone registering at the door is asked for — configured separately from the public form, so the door version can ask less."
        }
        notApplicable={clusterNotApplicableToggles(cluster.kind)}
        prerequisites={prerequisites}
        successMessages={successMessages}
        eventName={cluster.name}
      />
    </div>
  )
}
