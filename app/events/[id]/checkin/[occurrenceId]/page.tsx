import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "../checkin-board"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"

async function getOccurrenceWithEvent(occurrenceId: string) {
  return db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      id: true,
      date: true,
      isOpen: true,
      event: {
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
      },
    },
  })
}

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

type EventBrand = { logoUrl: string | null; primaryColor: string | null }

function resolveEventBrand(
  event: NonNullable<Awaited<ReturnType<typeof getOccurrenceWithEvent>>>["event"]
): EventBrand {
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

export default async function OccurrenceCheckinPage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  const [occurrence, lifeStages] = await Promise.all([
    getOccurrenceWithEvent(occurrenceId),
    getLifeStages(),
  ])

  if (!occurrence || occurrence.event.id !== id || occurrence.event.type === "OneTime") {
    notFound()
  }

  const { logoUrl, primaryColor } = resolveEventBrand(occurrence.event)
  const bannerUrl = occurrence.event.registrationPageBannerUrl ?? null
  const ministryNames = occurrence.event.ministries.map((em) => em.ministry.name).join(" · ")
  const defaultLifeStageId =
    occurrence.event.ministries.length === 1 && occurrence.event.ministries[0].ministry.lifeStageId
      ? occurrence.event.ministries[0].ministry.lifeStageId
      : undefined

  const dateLabel = occurrence.date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const subtitle = `${ministryNames}${ministryNames ? " · " : ""}${dateLabel}`

  // Date gate: only allow check-in on the occurrence's date
  const today = new Date().toISOString().split("T")[0]
  const occurrenceDate = occurrence.date.toISOString().split("T")[0]

  if (today !== occurrenceDate && !occurrence.isOpen) {
    return (
      <div className="relative min-h-svh bg-muted">
        {bannerUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
            <div className="fixed inset-0 bg-black/50" />
          </>
        )}
        <CheckinHeader
          logoUrl={logoUrl}
          name={`${occurrence.event.name} Check-in`}
          subtitle={subtitle}
          primaryColor={primaryColor}
          bannerUrl={bannerUrl}
        />
        <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
          <div className="w-full max-w-md rounded-lg border bg-card overflow-hidden">
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="font-medium text-sm">Check-in not available</p>
              <p className="text-sm text-muted-foreground">
                This check-in link is only active on {dateLabel}.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Picker shows only when not auto-assigning. Auto-assign mode doesn't need the list client-side.
  const breakoutCandidates = occurrence.event.autoAssignBreakout
    ? []
    : await fetchBreakoutCandidates(id, occurrenceId)

  return (
    <div className="relative min-h-svh bg-muted">
      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="fixed inset-0 h-full w-full object-cover" />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}
      <CheckinHeader
        logoUrl={logoUrl}
        name={`${occurrence.event.name} Check-in`}
        subtitle={subtitle}
        primaryColor={primaryColor}
        bannerUrl={bannerUrl}
      />
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className="w-full max-w-md rounded-lg border bg-card overflow-hidden">
          <CheckinBoard
            eventId={id}
            occurrenceId={occurrenceId}
            eventName={occurrence.event.name}
            includeSmallGroup={occurrence.event.formIncludeSmallGroup}
            includeDietary={occurrence.event.formIncludeDietary}
            lifeStages={lifeStages}
            defaultLifeStageId={defaultLifeStageId}
            autoAssignBreakout={occurrence.event.autoAssignBreakout}
            breakoutCandidates={breakoutCandidates}
            allowPayment={occurrence.event.formIncludePayment}
          />
        </div>
      </div>
    </div>
  )
}
