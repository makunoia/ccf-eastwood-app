import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { CatchMechEntryForm } from "./catch-mech-entry-form"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"

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

/**
 * The tables a facilitator can pick from. Under a Collab these are the CLUSTER's
 * tables endorsed to this event, not the event's own standing groups — see
 * `lib/catch-mech/scope.ts`.
 *
 * Only tables somebody can answer for are offered: an unstaffed table has no one
 * who could pass verification, so listing it is a dead end.
 */
async function getCatchMechGroups(eventId: string) {
  const scope = await resolveCatchMechScope(eventId)
  return db.breakoutGroup.findMany({
    // AND, not a spread: the Collab scope is itself an OR over the staffing
    // roles, and two OR keys in one object silently overwrite each other.
    where: {
      AND: [
        scope.where,
        {
          OR: [
            { facilitatorId: { not: null } },
            { coFacilitatorId: { not: null } },
            { subFacilitators: { some: {} } },
          ],
        },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
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

  const groups = await getCatchMechGroups(id)

  const brand = resolveEventBrand(event)
  const theme = resolveFormTheme(formConfig, {
    title: event.name,
    description: "Catch Mech — Follow-up",
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
