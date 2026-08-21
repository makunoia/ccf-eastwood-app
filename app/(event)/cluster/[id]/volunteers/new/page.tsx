import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canWrite } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import { getAccessibleClusterEvents } from "@/lib/clusters/aggregate"
import { clusterEventMinistryLabel } from "@/lib/clusters/ministry-label"
import { NewClusterVolunteerForm } from "./new-cluster-volunteer-form"

export const metadata: Metadata = {
  title: "New Volunteer",
}

/**
 * Add someone to the day's serving team.
 *
 * The ministry question comes first, exactly as it does on the public form, and
 * for the same reason: a `Volunteer` row is owned by an event, so the day cannot
 * file one until it knows which ministry the person serves under. Committees
 * follow that answer — picking the partner ministry's committee is not a mistake
 * the form should make possible.
 *
 * Only the ministries this user may write to are offered. A staff user scoped to
 * one member event sees one choice, which is the same narrowing the rest of the
 * cluster workspace applies; the action re-checks it regardless.
 */
export default async function NewClusterVolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, cluster] = await Promise.all([
    auth(),
    db.eventCluster.findUnique({
      where: { id },
      select: { id: true, name: true, kind: true },
    }),
  ])
  if (!cluster) notFound()
  if (cluster.kind !== ClusterKind.Collab) notFound()
  if (!canWrite(session, "Events")) redirect(`/cluster/${id}/volunteers`)

  const accessible = await getAccessibleClusterEvents(session, id)
  const [events, members] = await Promise.all([
    accessible.length
      ? db.event.findMany({
          where: { id: { in: accessible.map((e) => e.id) } },
          select: {
            id: true,
            name: true,
            allMinistries: true,
            ministries: { select: { ministry: { select: { name: true } } } },
            committees: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                roles: {
                  orderBy: { createdAt: "asc" },
                  select: { id: true, name: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ])

  // Cluster order, not the id-order Prisma returned them in — the ministry list
  // should read the same here as on the public form.
  const order = new Map(accessible.map((e, i) => [e.id, i]))
  const ministries = events
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((e) => ({
      eventId: e.id,
      label: clusterEventMinistryLabel(e),
      committees: e.committees,
    }))

  return (
    <NewClusterVolunteerForm
      clusterId={cluster.id}
      clusterName={cluster.name}
      ministries={ministries}
      members={members}
    />
  )
}
