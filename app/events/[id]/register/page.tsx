import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ministryLabel } from "@/lib/events/ministry-label"
import { getEventName } from "@/lib/metadata"
import { RegistrationForm } from "./registration-form"
import { fetchBreakoutAvailability } from "@/lib/breakout-suggestion-server"
import { resolveBreakoutNotice } from "@/lib/breakout-suggestion"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import {
  getEffectiveFormConfig,
  getEventFormSuccessMessage,
} from "@/lib/forms/context-config-server"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"

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
      allMinistries: true,
      registrationStart: true,
      registrationEnd: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
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
  // The public form is open only when the manual toggle is on AND we're inside the
  // event's Opens/Closes window. Walk-ins are staff-supervised at the door — neither
  // a closed toggle nor a passed close date must block someone at the kiosk.
  const withinWindow = isWithinRegistrationWindow(
    event.registrationStart,
    event.registrationEnd
  )
  if ((!formConfig.isOpen || !withinWindow) && !walkIn) return <FormClosed />

  // Walk-ins are the same form as Register but a separate configured context.
  const formContext = walkIn ? "WalkIn" : "Register"
  const [formFields, successMessage] = await Promise.all([
    getEffectiveFormConfig(id, formContext),
    getEventFormSuccessMessage(id, formContext),
  ])

  const lifeStages = formFields.fieldLifeStage
    ? await db.lifeStage.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      })
    : []

  const ageRanges = formFields.fieldAgeRange
    ? await db.ageRangeBucket.findMany({
        orderBy: { order: "asc" },
        select: { id: true, label: true },
      })
    : []

  const defaultLifeStageId =
    event.ministries.length === 1 && event.ministries[0].ministry.lifeStageId
      ? event.ministries[0].ministry.lifeStageId
      : undefined

  // Breakout picker renders when this context enables the section, the event isn't
  // auto-assigning, AND groups exist. Auto-assign wins: there is nothing to pick
  // when placement happens on submit.
  const offerBreakoutPicker = formFields.sectionBreakout && !event.autoAssignBreakout

  // Two different rules, on purpose:
  //  - At the door, only groups whose facilitator has already checked in are
  //    offered — a walk-in shouldn't be sent to a group whose leader isn't here.
  //  - On the public form, every group is offered. People register days ahead,
  //    when by definition nobody has checked in to anything.
  const { candidates: breakoutCandidates, totalGroups: breakoutTotalGroups } =
    !offerBreakoutPicker
      ? { candidates: [], totalGroups: 0 }
      : await fetchBreakoutAvailability(event.id, walkIn?.occurrenceId ?? null, !!walkIn)

  // The gate is strict by design, but it must not be silent: when groups exist
  // and every one of them is held back, say so instead of dropping the step and
  // leaving the person at the kiosk wondering where it went.
  const breakoutNotice = resolveBreakoutNotice({
    offerPicker: offerBreakoutPicker,
    candidateCount: breakoutCandidates.length,
    totalGroups: breakoutTotalGroups,
  })

  const brand = resolveEventBrand(event)
  const ministryNames = ministryLabel(
    event.allMinistries,
    event.ministries.map((em) => em.ministry.name)
  )
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
        config={formFields}
        successMessage={successMessage}
        lifeStages={lifeStages}
        ageRanges={ageRanges}
        defaultLifeStageId={defaultLifeStageId}
        breakoutCandidates={breakoutCandidates}
        breakoutNotice={breakoutNotice}
        walkIn={walkIn}
      />
    </PublicFormShell>
  )
}
