import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventSettingsClient } from "./settings-client"

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().split("T")[0] : ""
}

async function getEventSettings(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      startDate: true,
      endDate: true,
      price: true,
      registrationStart: true,
      registrationEnd: true,
      recurrenceDayOfWeek: true,
      recurrenceFrequency: true,
      recurrenceEndDate: true,
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
  const [event, allMinistries] = await Promise.all([
    getEventSettings(id),
    db.ministry.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  if (!event) notFound()

  const showEmbarkation = event.type !== "Recurring"

  const linkedMinistries = event.ministries.map((em) => em.ministry)

  return (
    <EventSettingsClient
      eventId={event.id}
      allMinistries={allMinistries}
      details={{
        name: event.name,
        description: event.description ?? "",
        ministryIds: event.ministries.map((em) => em.ministry.id),
        type: event.type,
        startDate: toDateInput(event.startDate),
        endDate: toDateInput(event.endDate),
        price: event.price != null ? (event.price / 100).toFixed(2) : "",
        registrationStart: toDateInput(event.registrationStart),
        registrationEnd: toDateInput(event.registrationEnd),
        recurrenceDayOfWeek:
          event.recurrenceDayOfWeek != null ? String(event.recurrenceDayOfWeek) : "",
        recurrenceFrequency: event.recurrenceFrequency ?? "",
        recurrenceEndDate: toDateInput(event.recurrenceEndDate),
      }}
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
