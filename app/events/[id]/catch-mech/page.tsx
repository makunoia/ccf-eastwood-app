import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { CatchMechEntryForm } from "./catch-mech-entry-form"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"

async function getEventData(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageBannerUrl: true,
      modules: { select: { type: true } },
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          facilitatorId: true,
          coFacilitatorId: true,
        },
      },
      ministries: {
        select: {
          ministry: {
            select: {
              id: true,
              logoUrl: true,
              themeColorPrimary: true,
            },
          },
        },
      },
    },
  })
  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null
  return event
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  return { title: { absolute: name ? `Catch Mech · ${name}` : "Catch Mech" } }
}

export default async function CatchMechEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventData(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("CatchMech", id)
  if (!formConfig.isOpen) return <FormClosed />

  const groups = event.breakoutGroups.filter(
    (g) => g.facilitatorId || g.coFacilitatorId
  )

  const brand = resolveEventBrand(event)
  const theme = resolveFormTheme(formConfig, {
    title: event.name,
    description: "Catch Mech — Facilitator Check-in",
    logoUrl: brand.logoUrl,
    bannerUrl: event.registrationPageBannerUrl ?? null,
    primaryColor: brand.primaryColor,
  })

  return (
    <PublicFormShell theme={theme} alt={event.name}>
      <div className="rounded-lg border bg-card p-6">
        <CatchMechEntryForm eventId={id} groups={groups} />
      </div>
    </PublicFormShell>
  )
}
