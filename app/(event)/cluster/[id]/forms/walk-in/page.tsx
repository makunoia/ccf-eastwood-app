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
import { SettingCard } from "@/components/ui/setting-card"
import { EventFormBuilder } from "@/components/forms/event-form-builder"
import { clusterFormPrerequisites } from "@/lib/forms/form-prerequisites-server"
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
    select: { id: true, name: true, publicToken: true },
  })
  if (!cluster) notFound()

  const [configs, successMessages, prerequisites] = await Promise.all([
    getClusterFormConfigs(id),
    getClusterFormSuccessMessages(id),
    clusterFormPrerequisites(),
  ])

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

      <SettingCard
        className="max-w-2xl"
        title="Walk-in link"
        description="The same shared form with door semantics: it ignores the open/close toggle and registration window, reuses existing registrations instead of erroring, and checks the person in immediately — on one-time events, and on recurring events through the session this day is linked to."
      >
        <a
          href={clusterWalkInPath(cluster.publicToken)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          View walk-in form
        </a>
      </SettingCard>

      <EventFormBuilder
        clusterId={id}
        initial={configs}
        contexts={["WalkIn"]}
        heading="Walk-in form"
        blurb="What someone registering at the door is asked for — configured separately from the public form, so the door version can ask less."
        notApplicable={["sectionPayment", "sectionBreakout", "sectionFamily", "familySpouseOnly"]}
        prerequisites={prerequisites}
        successMessages={successMessages}
        eventName={cluster.name}
      />
    </div>
  )
}
