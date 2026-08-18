import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ClusterKind } from "@/app/generated/prisma/client"
import { getAccessibleClusterEvents } from "@/lib/clusters/aggregate"
import { PageHeader } from "@/components/page-header"
import { ClusterFormsList } from "./cluster-forms-list"

export const metadata: Metadata = {
  title: "Forms",
}

export default async function ClusterFormsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      isOpen: true,
      walkInIsOpen: true,
      checkInIsOpen: true,
      volunteerIsOpen: true,
    },
  })
  if (!cluster) notFound()

  const events = await getAccessibleClusterEvents(session, id)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Forms"
        description="Manage the shared registration form and the day's check-in surfaces"
      />
      <ClusterFormsList
        clusterId={id}
        initialIsOpen={cluster.isOpen}
        walkInIsOpen={cluster.walkInIsOpen}
        checkInIsOpen={cluster.checkInIsOpen}
        volunteerIsOpen={cluster.volunteerIsOpen}
        isCollab={cluster.kind === ClusterKind.Collab}
        eventCount={events.length}
      />
    </div>
  )
}
