import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { LinkTabs } from "@/components/link-tabs"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ClustersToolbar } from "./create-cluster-dialog"

export const metadata: Metadata = {
  title: "Event Clusters",
}

export default async function EventClustersPage() {
  const session = await auth()

  const clusters = await db.eventCluster.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      date: true,
      isOpen: true,
      events: {
        orderBy: { order: "asc" },
        select: { eventId: true, event: { select: { name: true } } },
      },
    },
  })

  // A Staff user sees a cluster when they can access at least one member event;
  // an empty cluster is Super Admin's to see (there's nothing scoped inside yet).
  const visible = clusters.filter(
    (c) =>
      isSuperAdmin(session) ||
      c.events.some((e) => canAccessEvent(session, e.eventId))
  )

  const counts = await db.eventRegistrant.groupBy({
    by: ["registrationClusterId"],
    where: { registrationClusterId: { in: visible.map((c) => c.id) } },
    _count: { _all: true },
  })
  const registrationCounts = new Map(
    counts.map((c) => [c.registrationClusterId, c._count._all])
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Event Clusters"
        description="Run several events as one day — shared registration, combined monitoring"
        actions={<ClustersToolbar />}
      />

      <LinkTabs
        tabs={[
          { label: "Events", href: "/events", exact: true },
          { label: "Event Clusters", href: "/events/clusters" },
        ]}
      />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No event clusters yet. Create one to run several events as a single day.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Events</TableHead>
                <TableHead className="text-right">Shared-form registrations</TableHead>
                <TableHead>Form</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((cluster) => (
                <TableRow key={cluster.id}>
                  <TableCell>
                    <Link
                      href={`/cluster/${cluster.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {cluster.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cluster.date
                      ? cluster.date.toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cluster.events.length === 0
                      ? "No events"
                      : cluster.events.map((e) => e.event.name).join(" · ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {registrationCounts.get(cluster.id) ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cluster.isOpen ? "default" : "outline"}>
                      {cluster.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
