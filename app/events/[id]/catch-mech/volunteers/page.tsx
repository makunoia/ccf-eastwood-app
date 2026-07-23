import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { FormClosed } from "@/components/form-closed"
import { PublicFormShell } from "@/components/public-form-shell"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { VolunteerEntryForm } from "./volunteer-entry-form"

async function getEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageBannerUrl: true,
      modules: { select: { type: true } },
      ministries: {
        select: {
          ministry: {
            select: { id: true, logoUrl: true, themeColorPrimary: true },
          },
        },
      },
    },
  })
  if (!event || !event.modules.some((module) => module.type === "CatchMech")) return null
  return event
}

export default async function CatchMechVolunteerEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("CatchMech", id)
  if (!formConfig.isOpen) return <FormClosed />

  const brand = resolveEventBrand(event)
  const theme = resolveFormTheme(formConfig, {
    title: event.name,
    description: "Catch Mech volunteer follow-up",
    logoUrl: brand.logoUrl,
    bannerUrl: event.registrationPageBannerUrl ?? null,
    primaryColor: brand.primaryColor,
  })

  return (
    <PublicFormShell theme={theme} alt={event.name}>
      <div className="rounded-lg border bg-card p-6">
        <VolunteerEntryForm eventId={id} />
      </div>
    </PublicFormShell>
  )
}
