import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerInfoForm } from "./volunteer-info-form"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"

async function getPageData(id: string) {
  const [event, lifeStages] = await Promise.all([
    db.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        startDate: true,
        useMinistryBrand: true,
        brandMinistryId: true,
        logoUrl: true,
        themeColorPrimary: true,
        ministries: {
          select: {
            ministry: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                themeColorPrimary: true,
              },
            },
          },
        },
      },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  return { event, lifeStages }
}

export default async function VolunteerInfoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { event, lifeStages } = await getPageData(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("VolunteerInfo", id)
  if (!formConfig.isOpen) return <FormClosed />

  const brand = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const pageDescription = [ministryNames, event.type !== "Recurring" ? dateLabel : ""]
    .filter(Boolean)
    .join(" · ")

  const theme = resolveFormTheme(formConfig, {
    title: event.name,
    description: pageDescription || "Volunteer Information Update",
    logoUrl: brand.logoUrl,
    bannerUrl: null,
    primaryColor: brand.primaryColor,
  })

  return (
    <PublicFormShell
      theme={theme}
      alt={event.name}
      wide
      headerExtra={
        pageDescription ? (
          <p className="mt-0.5 text-sm font-medium">Volunteer Information Update</p>
        ) : undefined
      }
    >
      <VolunteerInfoForm eventId={id} lifeStages={lifeStages} />
    </PublicFormShell>
  )
}
