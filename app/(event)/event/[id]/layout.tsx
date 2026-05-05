import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { EventHeader } from "@/components/event-header"
import { EventSidebar } from "@/components/event-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { BreadcrumbProvider, BreadcrumbOverride } from "@/components/breadcrumb-context"

async function getEventMeta(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      themeColorSecondary: true,
      themeColorAccent: true,
      modules: { select: { type: true } },
      ministries: {
        select: {
          ministry: {
            select: {
              id: true,
              logoUrl: true,
              themeColorPrimary: true,
              themeColorSecondary: true,
              themeColorAccent: true,
            },
          },
        },
      },
    },
  })
}

function resolveLogoUrl(event: Awaited<ReturnType<typeof getEventMeta>>): string | null {
  if (!event) return null
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return ministry?.ministry.logoUrl ?? null
  }
  return event.logoUrl ?? null
}

function resolveSidebarBrand(event: Awaited<ReturnType<typeof getEventMeta>>): string | null {
  if (!event) return null
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return ministry?.ministry.themeColorPrimary ?? null
  }
  return event.themeColorPrimary ?? null
}

function resolveBrandBackground(event: Awaited<ReturnType<typeof getEventMeta>>): string | null {
  if (!event) return null
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return ministry?.ministry.themeColorSecondary ?? null
  }
  return event.themeColorSecondary ?? null
}

function resolveBrandAccent(event: Awaited<ReturnType<typeof getEventMeta>>): string | null {
  if (!event) return null
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return ministry?.ministry.themeColorAccent ?? null
  }
  return event.themeColorAccent ?? null
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

  if (!canAccessEvent(session, id)) {
    redirect("/dashboard")
  }

  const modules = event.modules.map((m) => m.type)
  const showBackLink = isSuperAdmin(session)
  const logoUrl = resolveLogoUrl(event)
  const sidebarBrand = resolveSidebarBrand(event)
  const brandBackground = resolveBrandBackground(event)
  const brandAccent = resolveBrandAccent(event)

  return (
    <SidebarProvider
      className="h-svh"
      brandColor={sidebarBrand}
      brandBackground={brandBackground}
      brandAccent={brandAccent}
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
        logoUrl={logoUrl}
      />
      <SidebarInset className="overflow-hidden">
        <BreadcrumbProvider>
          <BreadcrumbOverride href={`/event/${id}`} label={event.name} />
          <EventHeader eventId={event.id} eventType={event.type} />
          <div className="flex flex-1 flex-col overflow-y-auto min-h-0">
            {children}
          </div>
        </BreadcrumbProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
