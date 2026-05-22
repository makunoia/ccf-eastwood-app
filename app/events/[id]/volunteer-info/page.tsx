import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerInfoForm } from "./volunteer-info-form"

async function getPageData(id: string) {
  const [event, lifeStages] = await Promise.all([
    db.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        startDate: true,
        useMinistryBrand: true,
        brandMinistryId: true,
        logoUrl: true,
        themeColorPrimary: true,
        ministries: {
          select: {
            ministry: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                themeColorPrimary: true,
              },
            },
          },
        },
      },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  return { event, lifeStages }
}

function resolveEventBrand(event: NonNullable<Awaited<ReturnType<typeof getPageData>>["event"]>) {
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

export default async function VolunteerInfoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { event, lifeStages } = await getPageData(id)
  if (!event) notFound()

  const { logoUrl, primaryColor } = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const pageDescription = [ministryNames, event.type !== "Recurring" ? dateLabel : ""]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="relative min-h-svh bg-muted">
      {/* Branded header band */}
      <div
        className="relative px-6 pt-8 pb-16 text-center overflow-hidden"
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {/* Gradient overlays for depth */}
        {primaryColor && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </>
        )}
        <div className="relative mx-auto w-full max-w-md">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={event.name}
              className="mx-auto mb-4 size-20 rounded-xl object-contain"
              style={primaryColor ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
            />
          )}
          <h1 className={`text-2xl font-bold ${primaryColor ? "text-white" : ""}`}>
            {event.name}
          </h1>
          <p className={`mt-1 text-sm ${primaryColor ? "text-white/75" : "text-muted-foreground"}`}>
            {pageDescription || "Volunteer Information Update"}
          </p>
          {pageDescription && (
            <p className={`mt-0.5 text-sm font-medium ${primaryColor ? "text-white/90" : "text-muted-foreground"}`}>
              Volunteer Information Update
            </p>
          )}
        </div>
      </div>

      {/* Form area */}
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-lg">
          <VolunteerInfoForm eventId={id} lifeStages={lifeStages} />
        </div>
      </div>
    </div>
  )
}
