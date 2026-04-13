import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { EventHeader } from "@/components/event-header"
import { EventSidebar } from "@/components/event-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"

async function getEventMeta(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      modules: { select: { type: true } },
    },
  })
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params
  const event = await getEventMeta(id)
  if (!event) notFound()

  // Check event-specific access for Staff users
  if (!canAccessEvent(session, id)) {
    redirect("/dashboard")
  }

  const modules = event.modules.map((m) => m.type)
  const showBackLink = isSuperAdmin(session)

  return (
    <SidebarProvider
      className="h-svh"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <EventSidebar
        variant="inset"
        eventId={event.id}
        eventName={event.name}
        eventType={event.type}
        modules={modules}
        showBackLink={showBackLink}
      />
      <SidebarInset>
        <EventHeader eventId={event.id} eventType={event.type} />
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
