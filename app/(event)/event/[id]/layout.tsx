import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { EventHeader } from "@/components/event-header"
import { EventSidebar } from "@/components/event-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { resolveLandingPath } from "@/lib/landing"
import { AssistantPanel } from "@/components/assistant/assistant-panel"
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

// Retemplates every page in the event workspace as "Section · Event Name", so
// tabs for two different events stay tellable apart.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  if (!name) return { title: "Event" }
  return { title: { default: name, template: `%s · ${name}` } }
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

  // Single-event-scoped users are locked into this mini-app with no top-level
  // sidebar (and its logout). Give them a logout button here instead.
  const landingPath = resolveLandingPath({
    role: session.user.role,
    permissions: session.user.permissions,
    eventAccess: session.user.eventAccess,
  })
  const showLogout = landingPath.startsWith("/event/")
  const logoUrl = resolveLogoUrl(event)
  const sidebarBrand = resolveSidebarBrand(event)
  const brandBackground = resolveBrandBackground(event)
  const brandAccent = resolveBrandAccent(event)

  return (
    <SidebarProvider
      className="min-h-dvh"
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
        showLogout={showLogout}
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
        {isSuperAdmin(session) && <AssistantPanel />}
      </SidebarInset>
    </SidebarProvider>
  )
}
