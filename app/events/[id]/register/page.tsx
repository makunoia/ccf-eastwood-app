import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { RegistrationForm } from "./registration-form"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"

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
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  return { title: { absolute: name ? `Register · ${name}` : "Register" } }
}

// Walk-in mode: the check-in board links here instead of embedding its own copy
// of the form, so kiosk registration and public registration can never drift.
// `checkin=1` is a OneTime event; `checkin=<occurrenceId>` is a MultiDay/Recurring
// session. Either way the registrant is checked in on submit.
async function parseWalkIn(
  eventId: string,
  checkin: string | undefined,
  mobile: string | undefined
) {
  if (!checkin) return undefined
  const occurrenceId = checkin === "1" ? null : checkin
  // A hand-edited or stale occurrence id would otherwise render a form that only
  // fails on submit — reject it here instead.
  if (occurrenceId) {
    const occurrence = await db.eventOccurrence.findFirst({
      where: { id: occurrenceId, eventId },
      select: { id: true },
    })
    if (!occurrence) notFound()
  }
  return {
    occurrenceId,
    prefill: mobile ? { mobileNumber: mobile } : {},
    backHref: occurrenceId
      ? `/events/${eventId}/checkin/${occurrenceId}`
      : `/events/${eventId}/checkin`,
  }
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ checkin?: string; mobile?: string }>
}) {
  const { id } = await params
  const { checkin, mobile } = await searchParams
  const event = await getEvent(id)
  if (!event) notFound()

  const walkIn = await parseWalkIn(id, checkin, mobile)

  const formConfig = await getFormConfig("EventRegistration", id)
  // Walk-ins are staff-supervised at the door — a closed public form must not
  // block someone standing in front of the kiosk.
  if (!formConfig.isOpen && !walkIn) return <FormClosed />

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
    : walkIn
      ? // At the door, only groups whose facilitator has already checked in are offered.
        await fetchBreakoutCandidates(event.id, walkIn.occurrenceId, true)
      : await fetchBreakoutCandidates(event.id, breakoutOccurrenceId, false)

  const brand = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  // EventRegistration uses its dedicated columns for the page theme; FormConfig
  // overrides (which are unused for this key) fall through to these defaults.
  const theme = resolveFormTheme(formConfig, {
    title: walkIn
      ? `${event.name} Walk-in`
      : event.registrationPageTitle || `${event.name} Registration`,
    description:
      event.registrationPageDescription ||
      [ministryNames, event.type !== "Recurring" ? dateLabel : ""].filter(Boolean).join(" · "),
    logoUrl: brand.logoUrl,
    bannerUrl: event.registrationPageBannerUrl ?? null,
    primaryColor: brand.primaryColor,
  })

  const hasBg = !!(theme.bannerUrl || theme.primaryColor)

  return (
    <PublicFormShell
      theme={theme}
      alt={event.name}
      headerExtra={
        event.price != null ? (
          <p className={`mt-1 text-sm font-medium ${hasBg ? "" : "text-foreground"}`}>
            ₱
            {(event.price / 100).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}
          </p>
        ) : undefined
      }
    >
      <RegistrationForm
        eventId={event.id}
        eventName={event.name}
        includeSmallGroup={event.formIncludeSmallGroup}
        includeDietary={event.formIncludeDietary}
        includePayment={event.formIncludePayment}
        lifeStages={lifeStages}
        defaultLifeStageId={defaultLifeStageId}
        breakoutCandidates={breakoutCandidates}
        walkIn={walkIn}
      />
    </PublicFormShell>
  )
}
