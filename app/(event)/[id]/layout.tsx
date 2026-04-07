import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { EventSidebar } from "@/components/event-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

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

  const modules = event.modules.map((m) => m.type)

  // TODO: when roles are implemented, set showBackLink based on role:
  // showBackLink = session.user.role === "SuperAdmin"
  const showBackLink = true

  return (
    <SidebarProvider
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
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
