import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { CheckinBoard } from "./checkin-board"

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
      registrationPageBannerUrl: true,
      autoAssignBreakout: true,
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
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
  bannerUrl,
}: {
  logoUrl: string | null
  name: string
  subtitle?: string
  primaryColor?: string | null
  bannerUrl?: string | null
}) {
  const hasBg = !!(bannerUrl || primaryColor)
  return (
    <div
      className="relative px-6 pt-8 pb-16 text-center"
      style={!bannerUrl && primaryColor ? { backgroundColor: primaryColor } : undefined}
    >
      <div className="relative mx-auto w-full max-w-md">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            className="mx-auto mb-4 size-20 rounded-xl object-contain"
            style={hasBg ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
          />
        )}
        <h1 className={`text-2xl font-bold ${hasBg ? "text-white" : ""}`}>{name}</h1>
        {subtitle && (
          <p className={`mt-1 text-sm ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  return { title: { absolute: name ? `Check-in · ${name}` : "Check-in" } }
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
  const bannerUrl = event.registrationPageBannerUrl ?? null
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const subtitle = ministryNames || undefined

  if (event.type === "Recurring" || event.type === "MultiDay") {
    return (
      <div className="relative min-h-svh bg-muted">
        {bannerUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
            <div className="fixed inset-0 bg-black/50" />
          </>
        )}
        <CheckinHeader logoUrl={logoUrl} name={`${event.name} Check-in`} subtitle={subtitle} primaryColor={primaryColor} bannerUrl={bannerUrl} />
        <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
          <div className="w-full max-w-md rounded-lg border bg-card overflow-hidden">
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

  // Small-group prompt after check-in; walk-in registration itself lives on the
  // registration page (linked with ?checkin=…), not here.
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

  return (
    <div className="relative min-h-svh bg-muted">
      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}
      <CheckinHeader logoUrl={logoUrl} name={`${event.name} Check-in`} subtitle={subtitle} primaryColor={primaryColor} bannerUrl={bannerUrl} />
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-md rounded-lg border bg-card overflow-hidden">
          <CheckinBoard
            eventId={event.id}
            occurrenceId={null}
            lifeStages={lifeStages}
            defaultLifeStageId={defaultLifeStageId}
            autoAssignBreakout={event.autoAssignBreakout}
          />
        </div>
      </div>
    </div>
  )
}
