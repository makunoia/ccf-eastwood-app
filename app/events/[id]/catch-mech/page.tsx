import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CatchMechEntryForm } from "./catch-mech-entry-form"

async function getEventData(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageBannerUrl: true,
      modules: { select: { type: true } },
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          facilitatorId: true,
          coFacilitatorId: true,
        },
      },
      ministries: {
        select: {
          ministry: {
            select: {
              id: true,
              logoUrl: true,
              themeColorPrimary: true,
            },
          },
        },
      },
    },
  })
  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null
  return event
}

function resolveEventBrand(event: NonNullable<Awaited<ReturnType<typeof getEventData>>>) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return {
      logoUrl: ministry?.ministry.logoUrl ?? null,
      primaryColor: ministry?.ministry.themeColorPrimary ?? null,
    }
  }
  return {
    logoUrl: event.logoUrl ?? null,
    primaryColor: event.themeColorPrimary ?? null,
  }
}

export default async function CatchMechEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventData(id)
  if (!event) notFound()

  const groups = event.breakoutGroups.filter(
    (g) => g.facilitatorId || g.coFacilitatorId
  )

  const { logoUrl, primaryColor } = resolveEventBrand(event)
  const bannerUrl = event.registrationPageBannerUrl ?? null
  const hasBg = !!(bannerUrl || primaryColor)

  return (
    <div className="relative min-h-svh bg-muted">
      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}

      {/* Branded header band */}
      <div
        className="relative px-6 pt-8 pb-16 text-center"
        style={!bannerUrl && primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        <div className="relative mx-auto w-full max-w-md">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={event.name}
              className="mx-auto mb-4 size-20 rounded-xl object-contain"
              style={hasBg ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
            />
          )}
          <h1 className={`text-2xl font-bold ${hasBg ? "text-white" : ""}`}>{event.name}</h1>
          <p className={`mt-1 text-sm ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
            Catch Mech — Facilitator Check-in
          </p>
        </div>
      </div>

      {/* Form area */}
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <CatchMechEntryForm eventId={id} groups={groups} />
        </div>
      </div>
    </div>
  )
}
