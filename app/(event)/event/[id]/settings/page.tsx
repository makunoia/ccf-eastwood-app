import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventSettingsClient } from "./settings-client"

async function getEventSettings(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      themeColorSecondary: true,
      themeColorAccent: true,
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
      autoAssignBreakout: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
      modules: { select: { id: true, type: true } },
      buses: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          direction: true,
          _count: { select: { passengers: true } },
        },
      },
      committees: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          roles: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true },
          },
        },
      },
      ministries: {
        select: {
          ministry: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              themeColorPrimary: true,
              themeColorSecondary: true,
              themeColorAccent: true,
            },
          },
        },
      },
    },
  })
}

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventSettings(id)
  if (!event) notFound()

  const showEmbarkation = event.type !== "Recurring"

  const linkedMinistries = event.ministries.map((em) => em.ministry)

  return (
    <EventSettingsClient
      eventId={event.id}
      enabledModules={event.modules.map((m) => m.type)}
      buses={event.buses}
      committees={event.committees}
      showEmbarkation={showEmbarkation}
      branding={{
        useMinistryBrand: event.useMinistryBrand,
        brandMinistryId: event.brandMinistryId ?? "",
        logoUrl: event.logoUrl ?? "",
        themeColorPrimary: event.themeColorPrimary ?? "",
        themeColorSecondary: event.themeColorSecondary ?? "",
        themeColorAccent: event.themeColorAccent ?? "",
      }}
      formModules={{
        SmallGroup: event.formIncludeSmallGroup,
        Dietary: event.formIncludeDietary,
        Payment: event.formIncludePayment,
        AutoAssignBreakout: event.autoAssignBreakout,
      }}
      linkedMinistries={linkedMinistries}
      registrationPage={{
        registrationPageTitle: event.registrationPageTitle ?? "",
        registrationPageDescription: event.registrationPageDescription ?? "",
        registrationPageBannerUrl: event.registrationPageBannerUrl ?? "",
      }}
    />
  )
}
