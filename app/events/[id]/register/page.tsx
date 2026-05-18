import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RegistrationForm } from "./registration-form"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"

async function getEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      endDate: true,
      price: true,
      registrationStart: true,
      registrationEnd: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
      autoAssignBreakout: true,
      ministries: {
        select: {
          ministry: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              themeColorPrimary: true,
              lifeStageId: true,
            },
          },
        },
      },
    },
  })
  return event ?? null
}

function resolveEventBrand(event: NonNullable<Awaited<ReturnType<typeof getEvent>>>) {
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

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const lifeStages = event.formIncludeSmallGroup
    ? await db.lifeStage.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      })
    : []

  const defaultLifeStageId =
    event.ministries.length === 1 && event.ministries[0].ministry.lifeStageId
      ? event.ministries[0].ministry.lifeStageId
      : undefined

  // Breakout picker section only renders when not in auto-assign mode AND groups exist.
  // For Recurring events, only show groups whose facilitator has checked in to the open session.
  let breakoutOccurrenceId: string | null = null
  if (!event.autoAssignBreakout && event.type === "Recurring") {
    const openOccurrence = await db.eventOccurrence.findFirst({
      where: { eventId: event.id, isOpen: true },
      select: { id: true },
    })
    breakoutOccurrenceId = openOccurrence?.id ?? null
  }

  const breakoutCandidates = event.autoAssignBreakout
    ? []
    : await fetchBreakoutCandidates(event.id, breakoutOccurrenceId, false)

  const { logoUrl, primaryColor } = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  return (
    <div className="min-h-svh bg-muted">
      {/* Branded header band */}
      <div
        className={primaryColor ? "px-6 pt-8 pb-16 text-center" : "px-6 pt-12 pb-16 text-center"}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={event.name}
            className="mx-auto mb-4 size-20 rounded-xl object-contain"
            style={primaryColor ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
          />
        )}
        <h1 className={`text-2xl font-bold ${primaryColor ? "text-white" : ""}`}>{event.name} Registration</h1>
        <p className={`mt-1 text-sm ${primaryColor ? "text-white/75" : "text-muted-foreground"}`}>
          {ministryNames}{ministryNames && event.type !== "Recurring" ? " · " : ""}{event.type !== "Recurring" ? dateLabel : ""}
        </p>
        {event.price != null && (
          <p className={`mt-1 text-sm font-medium ${primaryColor ? "text-white/90" : ""}`}>
            ₱
            {(event.price / 100).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}
          </p>
        )}
      </div>

      {/* Form area */}
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-md">
          <RegistrationForm
            eventId={event.id}
            eventName={event.name}
            includeSmallGroup={event.formIncludeSmallGroup}
            includeDietary={event.formIncludeDietary}
            includePayment={event.formIncludePayment}
            lifeStages={lifeStages}
            defaultLifeStageId={defaultLifeStageId}
            breakoutCandidates={breakoutCandidates}
          />
        </div>
      </div>
    </div>
  )
}
