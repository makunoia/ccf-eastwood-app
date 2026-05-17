import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "./checkin-board"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"

async function getEvent(id: string) {
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
      autoAssignBreakout: true,
      formIncludePayment: true,
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
  })
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

function CheckinHeader({
  logoUrl,
  name,
  subtitle,
  primaryColor,
}: {
  logoUrl: string | null
  name: string
  subtitle?: string
  primaryColor?: string | null
}) {
  if (primaryColor) {
    return (
      <div className="px-6 pt-6 pb-16 text-center" style={{ backgroundColor: primaryColor }}>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            className="mx-auto mb-3 size-16 rounded-2xl object-contain bg-white/20 p-1.5"
          />
        )}
        <h1 className="text-xl font-bold text-white">{name}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-white/75">{subtitle}</p>}
      </div>
    )
  }

  return (
    <div className="px-6 pt-8 pb-16 text-center">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className="mx-auto mb-3 size-16 rounded-2xl object-contain bg-muted p-1.5"
        />
      )}
      <h1 className="text-xl font-bold">{name}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const { logoUrl, primaryColor } = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const subtitle = ministryNames || undefined

  if (event.type === "Recurring" || event.type === "MultiDay") {
    return (
      <div className="min-h-svh bg-muted">
        <CheckinHeader logoUrl={logoUrl} name={`${event.name} Check-in`} subtitle={subtitle} primaryColor={primaryColor} />
        <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
          <div className="w-full max-w-sm rounded-lg border bg-card overflow-hidden">
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="font-medium text-sm">
                {event.type === "MultiDay" ? "Use the day check-in link" : "Use the session check-in link"}
              </p>
              <p className="text-sm text-muted-foreground">
                {event.type === "MultiDay"
                  ? "Each day has its own check-in link. Copy it from the event page in the admin dashboard."
                  : "Each session has its own check-in link. Copy it from the event page in the admin dashboard."}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const breakoutCandidates = event.autoAssignBreakout
    ? []
    : await fetchBreakoutCandidates(id, null)

  return (
    <div className="min-h-svh bg-muted">
      <CheckinHeader logoUrl={logoUrl} name={`${event.name} Check-in`} subtitle={subtitle} primaryColor={primaryColor} />
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-sm rounded-lg border bg-card overflow-hidden">
          <CheckinBoard
            eventId={event.id}
            occurrenceId={null}
            autoAssignBreakout={event.autoAssignBreakout}
            breakoutCandidates={breakoutCandidates}
            allowPayment={event.formIncludePayment}
          />
        </div>
      </div>
    </div>
  )
}
