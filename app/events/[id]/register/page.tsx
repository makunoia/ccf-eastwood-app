import { notFound } from "next/navigation"
import { db } from "@/lib/db"
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

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("EventRegistration", id)
  if (!formConfig.isOpen) return <FormClosed />

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
      />
    </PublicFormShell>
  )
}
