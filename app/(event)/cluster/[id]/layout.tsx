import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ClusterSidebar } from "@/components/cluster-sidebar"
import { EventHeader } from "@/components/event-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { AssistantPanel } from "@/components/assistant/assistant-panel"
import { BreadcrumbProvider, BreadcrumbOverride } from "@/components/breadcrumb-context"

async function getClusterMeta(id: string) {
  return db.eventCluster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      themeColorPrimary: true,
      events: { select: { eventId: true } },
    },
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { name: true },
  })
  if (!cluster) return { title: "Event Cluster" }
  return { title: { default: cluster.name, template: `%s · ${cluster.name}` } }
}

export default async function ClusterLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params
  const cluster = await getClusterMeta(id)
  if (!cluster) notFound()

  // A Staff user may open the cluster workspace when they can access at least
  // one member event; every figure inside is computed over their permitted
  // subset only (decision 3). Empty clusters are Super Admin territory.
  const canView =
    isSuperAdmin(session) ||
    cluster.events.some((e) => canAccessEvent(session, e.eventId))
  if (!canView) redirect("/dashboard")

  return (
    <SidebarProvider
      className="min-h-dvh"
      brandColor={cluster.themeColorPrimary}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <ClusterSidebar
        variant="inset"
        clusterId={cluster.id}
        clusterName={cluster.name}
        showBackLink={isSuperAdmin(session)}
        logoUrl={cluster.logoUrl}
      />
      <SidebarInset className="overflow-hidden">
        <BreadcrumbProvider>
          <BreadcrumbOverride href={`/cluster/${id}`} label={cluster.name} />
          <EventHeader />
          <div className="flex flex-1 flex-col overflow-y-auto min-h-0">
            {children}
          </div>
        </BreadcrumbProvider>
        {isSuperAdmin(session) && <AssistantPanel />}
      </SidebarInset>
    </SidebarProvider>
  )
}
