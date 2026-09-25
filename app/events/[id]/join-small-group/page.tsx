import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { JoinForm } from "@/app/join-small-group/join-form"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const event = await db.event.findUnique({ where: { id }, select: { name: true } })
  return { title: { absolute: event ? `Join a DGroup · ${event.name}` : "Join a DGroup" } }
}

export default async function EventJoinSmallGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true, name: true, useMinistryBrand: true, brandMinistryId: true,
      logoUrl: true, themeColorPrimary: true,
      registrationPageBannerUrl: true,
      modules: { select: { type: true } },
      ministries: { select: { ministry: { select: { id: true, logoUrl: true, themeColorPrimary: true } } } },
    },
  })
  if (!event || !event.modules.some(({ type }) => type === "Volunteers")) notFound()
  const [formConfig, lifeStages] = await Promise.all([
    getFormConfig("EventJoinSmallGroup", id),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!formConfig.isOpen) return <FormClosed />

  const brand = resolveEventBrand(event)
  const theme = resolveFormTheme(formConfig, {
    title: `${event.name} · Join a DGroup`,
    description: "Share a little about yourself and we’ll suggest DGroups led by this event’s volunteers.",
    logoUrl: brand.logoUrl,
    bannerUrl: event.registrationPageBannerUrl,
    primaryColor: brand.primaryColor,
  })
  return <PublicFormShell theme={theme} alt={event.name}><JoinForm lifeStages={lifeStages} eventId={id} /></PublicFormShell>
}
