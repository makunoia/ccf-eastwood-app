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
import { RegistrationFormFields } from "@/components/forms/registration-form-fields"
import { RegistrationPageTab } from "@/components/forms/registration-page-tab"
import { VolunteerInfoUrlCopier } from "@/components/forms/volunteer-info-url-copier"

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
      modules: { select: { type: true } },
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
      autoAssignBreakout: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
    },
  })
  if (!event) notFound()

  // Module-gated forms (e.g. Catch Mech) only exist when their module is enabled.
  if (meta.requiresEventModule && !event.modules.some((m) => m.type === meta.requiresEventModule)) {
    notFound()
  }

  const cfg = await getFormConfig(meta.key, id)

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

      {/* Dedicated config — relocated from Event Settings */}
      {meta.key === "EventRegistration" && (
        <div className="flex flex-col gap-8">
          <RegistrationFormFields
            eventId={id}
            initial={{
              SmallGroup: event.formIncludeSmallGroup,
              Dietary: event.formIncludeDietary,
              Payment: event.formIncludePayment,
              AutoAssignBreakout: event.autoAssignBreakout,
            }}
          />
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

      {meta.key === "VolunteerInfo" && (
        <SettingCard
          className="max-w-2xl"
          title="Share link"
          description="Share this link with volunteers so they can update their personal info, small group membership, and availability."
        >
          <VolunteerInfoUrlCopier eventId={id} />
        </SettingCard>
      )}
    </div>
  )
}
