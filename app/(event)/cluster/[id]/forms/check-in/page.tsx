import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterCheckinShortcuts,
} from "@/lib/clusters/aggregate"
import { clusterCheckinPath } from "@/lib/public-routes"
import { PageHeader } from "@/components/page-header"
import { CheckinFormsCard, type ClusterCheckinFormRow } from "../checkin-forms-card"
import { ClusterCheckInAccess } from "./check-in-access"

export const metadata: Metadata = {
  title: "Check-in",
}

export default async function ClusterCheckinFormsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true, publicToken: true, date: true, checkInIsOpen: true },
  })
  if (!cluster) notFound()

  // Each member event's check-in verdict, from the same resolver the kiosk and the
  // day's Shortcuts use. This page used to compute its own — matching *any* open
  // occurrence of the event, with no linked-session check and no date gate — so it
  // could badge "Session open" for an event the kiosk would skip as `noSession`.
  const events = await getAccessibleClusterEvents(session, id)
  const rows: ClusterCheckinFormRow[] = await getClusterCheckinShortcuts(
    events,
    cluster.date
  )

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
          title="Check-in"
          description="One kiosk for the whole day, plus each event's own check-in form"
        />
      </div>

      <ClusterCheckInAccess
        clusterId={cluster.id}
        publicPath={clusterCheckinPath(cluster.publicToken)}
        initialIsOpen={cluster.checkInIsOpen}
      />

      {/* The per-event kiosks still exist and the board's Shortcuts still point
          at them. The switch above now opens all of these at once, so this is a
          read-out of what it did — and the escape hatch for opening just one. */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Each event&apos;s own check-in form</h2>
        <CheckinFormsCard rows={rows} />
      </div>
    </div>
  )
}
