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
import { getEffectiveFormConfigs } from "@/lib/forms/context-config-server"
import { EventFormBuilder } from "@/components/forms/event-form-builder"
import { BreakoutAssignmentSetting } from "@/components/forms/breakout-assignment-setting"
import { RegistrationPageTab } from "@/components/forms/registration-page-tab"
import { RegistrationWindowSetting } from "@/components/forms/registration-window-setting"
import { VolunteerInfoUrlCopier } from "@/components/forms/volunteer-info-url-copier"
import { PublicLinkCopier } from "@/components/forms/public-link-copier"

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
      type: true,
      modules: { select: { type: true } },
      autoAssignBreakout: true,
      registrationStart: true,
      registrationEnd: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
    },
  })
  if (!event) notFound()

  const modules = event.modules.map((m) => m.type)

  // Module-gated forms (e.g. Catch Mech) only exist when their module is enabled.
  if (meta.requiresEventModule && !modules.includes(meta.requiresEventModule)) {
    notFound()
  }

  const cfg = await getFormConfig(meta.key, id)
  const needsFormConfigs = meta.key === "EventRegistration" || meta.key === "EventCheckIn"
  const formConfigs = needsFormConfigs ? await getEffectiveFormConfigs(id) : null

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

      {/* Check-in opts out: it opens and closes per session, so a global toggle
          here would be a control that fights the one admins actually use. It gets
          a plain link copier below instead. */}
      {!meta.omitsFormConfigEditor && (
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
          publicUrl={meta.publicPath?.(id)}
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
              contexts={["Register", "WalkIn"]}
              modules={modules}
              heading="Registration form"
              blurb="Register and Walk-in are configured separately. Name, mobile number, and email are always collected — everything else is opt-in."
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

      {meta.key === "EventCheckIn" && (
        <div className="flex flex-col gap-8">
          {formConfigs && (
            <EventFormBuilder
              eventId={id}
              initial={formConfigs}
              contexts={["CheckIn"]}
              modules={modules}
              heading="Check-in form"
              blurb="What someone checking in for the first time is asked for. Returning attendees just confirm who they are."
            />
          )}

          <SettingCard
            className="max-w-2xl"
            title="Check-in link"
            description={
              event.type === "OneTime"
                ? "Share this link at the event so attendees and volunteers can check themselves in."
                : "Share this link at the event. It opens whichever session is currently accepting check-ins."
            }
          >
            <PublicLinkCopier path={`/events/${id}/checkin`} />
          </SettingCard>

          {event.type !== "OneTime" && (
            <SettingCard
              className="max-w-2xl"
              title="Opening and closing check-in"
              description="Check-in is opened per session rather than globally — open the session you're running from Sessions."
            >
              <Link
                href={`/event/${id}/sessions`}
                className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
              >
                Go to Sessions
              </Link>
            </SettingCard>
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
