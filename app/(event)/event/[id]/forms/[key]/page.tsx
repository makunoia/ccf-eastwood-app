import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import type { FormKey } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { SettingCard } from "@/components/ui/setting-card"
import { FORM_REGISTRY } from "@/lib/forms/registry"
import { getFormConfig } from "@/lib/forms/config"
import { FormConfigEditor } from "@/app/(dashboard)/forms/form-config-editor"
import {
  getEffectiveFormConfigs,
  getEventFormSuccessMessages,
} from "@/lib/forms/context-config-server"
import { EventFormBuilder } from "@/components/forms/event-form-builder"
import { eventFormPrerequisites } from "@/lib/forms/form-prerequisites-server"
import { BreakoutAssignmentSetting } from "@/components/forms/breakout-assignment-setting"
import { RegistrationPageTab } from "@/components/forms/registration-page-tab"
import { RegistrationWindowSetting } from "@/components/forms/registration-window-setting"
import { VolunteerInfoUrlCopier } from "@/components/forms/volunteer-info-url-copier"
import { WalkInSessionSetting } from "@/components/forms/walk-in-session-setting"
import { formatOccurrenceDate } from "@/lib/format/occurrence"

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().split("T")[0] : ""
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>
}): Promise<Metadata> {
  const { key } = await params
  const meta = FORM_REGISTRY[key as FormKey]
  return { title: meta ? meta.label : "Forms" }
}

export default async function EventFormEditorPage({
  params,
}: {
  params: Promise<{ id: string; key: string }>
}) {
  const { id, key } = await params
  const meta = FORM_REGISTRY[key as FormKey]
  if (!meta || meta.scope !== "event") notFound()

  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      modules: { select: { type: true } },
      autoAssignBreakout: true,
      registrationStart: true,
      registrationEnd: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
      walkInOccurrenceId: true,
    },
  })
  if (!event) notFound()

  const modules = event.modules.map((m) => m.type)

  // Module-gated forms (e.g. Catch Mech) only exist when their module is enabled.
  if (meta.requiresEventModule && !modules.includes(meta.requiresEventModule)) {
    notFound()
  }

  const cfg = await getFormConfig(meta.key, id)
  // Every key carrying dedicated config renders the per-context builder, so this
  // reads the flag rather than naming keys — one less place to edit per new form.
  const needsFormConfigs = !!meta.usesDedicatedConfig
  const formConfigs = needsFormConfigs ? await getEffectiveFormConfigs(id) : null
  const prerequisites = needsFormConfigs
    ? await eventFormPrerequisites(id, event.autoAssignBreakout)
    : undefined
  // Only the registration surfaces have a success screen to word (CCF-130).
  const successMessages =
    meta.key === "EventRegistration" || meta.key === "EventWalkIn"
      ? await getEventFormSuccessMessages(id)
      : null

  // Walk-in registers into one named session (CCF-133). OneTime events have no
  // occurrences to pick from — a walk-in there stamps `attendedAt` instead.
  const walkInOccurrences =
    meta.key === "EventWalkIn" && event.type !== "OneTime"
      ? await db.eventOccurrence.findMany({
          where: { eventId: id },
          orderBy: { date: "asc" },
          select: { id: true, date: true, isOpen: true },
        })
      : []

  /**
   * MultiDay and Recurring check-in has no event-wide open state to own: each
   * occurrence carries its own `isOpen`, and the public link resolves to whichever
   * one is accepting people. A switch here would be a second, competing control,
   * so those events get a pointer to the screen that actually holds it. OneTime
   * has no occurrences at all, so there the switch is the only control there is.
   */
  const checkInOpensPerSession = meta.key === "EventCheckIn" && event.type !== "OneTime"
  // Mirrors the Sessions page header: "Sessions" for Recurring, "Days" for MultiDay.
  const sessionsLabel = event.type === "Recurring" ? "Sessions" : "Days"

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <BreadcrumbOverride href={`/event/${id}/forms/${meta.key}`} label={meta.label} />
      <div className="flex flex-col gap-2">
        <Link
          href={`/event/${id}/forms`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Forms
        </Link>
        <PageHeader title={meta.label} description={meta.description} />
      </div>

      {/* Same Public access slot on every form. Session-based check-in keeps the
          section but swaps the switch for a link to the screen that owns the
          state, so the page reads consistently without carrying a dead control. */}
      {checkInOpensPerSession ? (
        <SettingCard
          className="max-w-2xl"
          title="Public access"
          description={`Check-in opens and closes per ${
            event.type === "Recurring" ? "session" : "day"
          } rather than event-wide — open the one you're running from ${sessionsLabel}.`}
        >
          <Link
            href={`/event/${id}/sessions`}
            className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
          >
            Go to {sessionsLabel}
          </Link>
        </SettingCard>
      ) : (
        <FormConfigEditor
          formKey={meta.key}
          eventId={id}
          initialIsOpen={cfg.isOpen}
          initialTheme={{
            title: cfg.title ?? "",
            description: cfg.description ?? "",
            logoUrl: cfg.logoUrl ?? "",
            bannerUrl: cfg.bannerUrl ?? "",
            primaryColor: cfg.primaryColor ?? "",
          }}
          themeFields={meta.themeFields}
          // Check-in is a kiosk surface for attendees, not something an admin
          // needs to open from here — the registry still keeps its publicPath for
          // revalidation and for the cluster Forms listing.
          publicUrl={meta.key === "EventCheckIn" ? undefined : meta.publicPath?.(id)}
        />
      )}

      {/* Dedicated config — relocated from Event Settings */}
      {meta.key === "EventRegistration" && (
        <div className="flex flex-col gap-8">
          {/* Recurring events register first-timers once and check everyone else in
              per occurrence, so a window would gate the wrong thing. */}
          {event.type !== "Recurring" && (
            <RegistrationWindowSetting
              eventId={id}
              initial={{
                registrationStart: toDateInput(event.registrationStart),
                registrationEnd: toDateInput(event.registrationEnd),
              }}
            />
          )}
          {formConfigs && (
            <EventFormBuilder
              eventId={id}
              initial={formConfigs}
              // Check-in is configured on its own Forms entry. Register and Walk-in
              // stay together here because they render the same component.
              // Walk-in has its own Forms entry — this page configures only the
              // form people fill in ahead of the day.
              contexts={["Register"]}
              modules={modules}
              prerequisites={prerequisites}
              heading="Registration form"
              blurb="Name, mobile number, and email are always collected — everything else is opt-in. The walk-in form is configured on its own entry."
              successMessages={successMessages ?? undefined}
              eventName={event.name}
            />
          )}
          {modules.includes("Breakout") && (
            <BreakoutAssignmentSetting eventId={id} initial={event.autoAssignBreakout} />
          )}
          <section className="space-y-4">
            <h3 className="type-label text-muted-foreground">Registration &amp; check-in page</h3>
            <RegistrationPageTab
              eventId={id}
              initial={{
                registrationPageTitle: event.registrationPageTitle ?? "",
                registrationPageDescription: event.registrationPageDescription ?? "",
                registrationPageBannerUrl: event.registrationPageBannerUrl ?? "",
              }}
            />
          </section>
        </div>
      )}

      {meta.key === "EventWalkIn" && (
        <div className="flex flex-col gap-8">
          {event.type !== "OneTime" && (
            <WalkInSessionSetting
              eventId={id}
              sessionsHref={`/event/${id}/sessions`}
              occurrences={walkInOccurrences.map((o) => ({
                id: o.id,
                label: formatOccurrenceDate(o.date),
                isOpen: o.isOpen,
              }))}
              initial={event.walkInOccurrenceId}
              sessionNoun={event.type === "Recurring" ? "session" : "day"}
            />
          )}
          {formConfigs && (
            <EventFormBuilder
              eventId={id}
              initial={formConfigs}
              contexts={["WalkIn"]}
              modules={modules}
              prerequisites={prerequisites}
              heading="Walk-in form"
              blurb="What someone registering at the door is asked for — configured separately from the public form, so the door version can ask less."
              successMessages={successMessages ?? undefined}
              eventName={event.name}
            />
          )}
        </div>
      )}

      {meta.key === "EventCheckIn" && (
        <div className="flex flex-col gap-8">
          {formConfigs && (
            <EventFormBuilder
              eventId={id}
              initial={formConfigs}
              contexts={["CheckIn"]}
              modules={modules}
              prerequisites={prerequisites}
              heading="Check-in form"
              blurb="What someone checking in for the first time is asked for. Returning attendees just confirm who they are."
            />
          )}
        </div>
      )}

      {meta.key === "VolunteerInfo" && (
        <SettingCard
          className="max-w-2xl"
          title="Share link"
          description="Share this link with volunteers so they can update their personal info, DGroup membership, and availability."
        >
          <VolunteerInfoUrlCopier eventId={id} />
        </SettingCard>
      )}
    </div>
  )
}
