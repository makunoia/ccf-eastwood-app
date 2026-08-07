import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ministryLabel } from "@/lib/events/ministry-label"
import { getEventName } from "@/lib/metadata"
import { RegistrationForm } from "../register/registration-form"
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

/**
 * The door surface (CCF-133). Same form component as `/register`, a different
 * configured context, and its own open/close rules:
 *
 *  - It ignores the registration form's toggle and the event's Opens/Closes
 *    window entirely. Those belong to the form people fill in ahead of the day;
 *    closing pre-registration the night before must not close the door.
 *  - The session comes from `Event.walkInOccurrenceId`, chosen by an admin on the
 *    Walk-in form config. It used to ride in the URL as `?checkin=<id>`, where a
 *    stale value reached the form and only failed on submit.
 *  - No session selected, or a selected session that is closed, means the walk-in
 *    form is unavailable — said plainly, rather than rendering a form that cannot
 *    succeed.
 *
 * OneTime events have no occurrences: submit stamps `attendedAt` on the
 * registrant instead, so there is nothing to resolve and nothing to gate on.
 */

async function getEvent(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      endDate: true,
      price: true,
      allMinistries: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      autoAssignBreakout: true,
      registrationPageBannerUrl: true,
      walkInOccurrenceId: true,
      walkInOccurrence: { select: { id: true, isOpen: true } },
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  return { title: { absolute: name ? `Walk-in · ${name}` : "Walk-in" } }
}

export default async function WalkInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mobile?: string }>
}) {
  const { id } = await params
  const { mobile } = await searchParams
  const event = await getEvent(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("EventWalkIn", id)
  if (!formConfig.isOpen) return <FormClosed title="Walk-in is currently unavailable" />

  // Session-based events need a live session to register into; OneTime events
  // never have one, and that is not a closed state.
  const needsSession = event.type !== "OneTime"
  const session = event.walkInOccurrence
  if (needsSession && !(session && session.isOpen)) {
    return <FormClosed title="No session is open for walk-in right now" />
  }

  const occurrenceId = needsSession ? (session?.id ?? null) : null
  const walkIn = {
    occurrenceId,
    prefill: mobile ? { mobileNumber: mobile } : {},
    backHref: occurrenceId
      ? `/events/${id}/checkin/${occurrenceId}`
      : `/events/${id}/checkin`,
  }

  const [formFields, successMessage] = await Promise.all([
    getEffectiveFormConfig(id, "WalkIn"),
    getEventFormSuccessMessage(id, "WalkIn"),
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

  const offerBreakoutPicker = formFields.sectionBreakout && !event.autoAssignBreakout

  // At the door, only groups whose facilitator has already checked in are offered
  // — a walk-in shouldn't be sent to a group whose leader isn't here. That is the
  // `true` argument; the public form passes `false` and offers every group.
  const { candidates: breakoutCandidates, totalGroups: breakoutTotalGroups } =
    !offerBreakoutPicker
      ? { candidates: [], totalGroups: 0 }
      : await fetchBreakoutAvailability(event.id, occurrenceId, true)

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

  // Unlike registration, walk-in has no dedicated Event columns for its page
  // copy — its FormConfig overrides are the only ones, falling back to the event
  // brand. That is what having its own form key buys.
  const theme = resolveFormTheme(formConfig, {
    title: `${event.name} Walk-in`,
    description: [ministryNames, event.type !== "Recurring" ? dateLabel : ""]
      .filter(Boolean)
      .join(" · "),
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
