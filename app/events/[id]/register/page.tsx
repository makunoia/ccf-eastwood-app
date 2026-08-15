import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ministryLabel } from "@/lib/events/ministry-label"
import { getEventName } from "@/lib/metadata"
import { RegistrationForm } from "./registration-form"
import { fetchBreakoutAvailability } from "@/lib/breakout-suggestion-server"
import { resolveBreakoutNotice, withoutOccupancy } from "@/lib/breakout-suggestion"
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

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ checkin?: string; mobile?: string }>
}) {
  const { id } = await params
  const { checkin, mobile } = await searchParams

  // Walk-in used to live here behind `?checkin=<occurrenceId|1>` (CCF-133). It is
  // its own form and its own route now, but the old URL is on kiosk bookmarks and
  // possibly printed material, so it redirects rather than 404s. The occurrence is
  // dropped on purpose — the walk-in page resolves it from the event's configured
  // session, which is the whole point of the split.
  if (checkin) {
    const query = mobile ? `?mobile=${encodeURIComponent(mobile)}` : ""
    redirect(`/events/${id}/walk-in${query}`)
  }

  const event = await getEvent(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("EventRegistration", id)
  // Open only when the manual toggle is on AND we're inside the event's
  // Opens/Closes window. Neither gate touches walk-in any more — that form owns
  // its own switch, so pre-registration can close the night before while the door
  // stays live.
  const withinWindow = isWithinRegistrationWindow(
    event.registrationStart,
    event.registrationEnd
  )
  if (!formConfig.isOpen || !withinWindow) return <FormClosed />

  const [formFields, successMessage] = await Promise.all([
    getEffectiveFormConfig(id, "Register"),
    getEventFormSuccessMessage(id, "Register"),
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

  // Every group is offered here. People register days ahead, when by definition
  // nobody has checked in to anything — the door applies the stricter
  // facilitator-present rule instead, on the walk-in page.
  const { candidates: breakoutCandidates, totalGroups: breakoutTotalGroups } =
    !offerBreakoutPicker
      ? { candidates: [], totalGroups: 0 }
      : await fetchBreakoutAvailability(event.id, null, false)

  // Headcounts are an admin-facing operational number. They ride along on the
  // walk-in page, where a staff member is doing the placing; here they are
  // stripped so they never reach a registrant's browser at all. Whether a group
  // is full still shows — that's a fact about the choice in front of them.
  const publicBreakoutCandidates = withoutOccupancy(breakoutCandidates)

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
    title: event.registrationPageTitle || `${event.name} Registration`,
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
          <p
            className={`mt-4 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${
              hasBg ? "border-white/25 bg-white/10" : "border-border bg-background text-foreground"
            }`}
          >
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
        breakoutCandidates={publicBreakoutCandidates}
        breakoutNotice={breakoutNotice}
      />
    </PublicFormShell>
  )
}
