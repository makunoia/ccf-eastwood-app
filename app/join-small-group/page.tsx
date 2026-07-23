import type { Metadata } from "next"
import { db } from "@/lib/db"
import { JoinForm } from "./join-form"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"

export const metadata: Metadata = {
  title: { absolute: "Find Your DGroup" },
}

async function getPageData() {
  const [settings, lifeStages] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "singleton" } }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  return {
    // SiteSettings join-page fields are the fallback; Forms-hub overrides supersede them.
    fallback: {
      title: settings?.joinPageTitle || "Find Your DGroup",
      description:
        settings?.joinPageDescription ||
        "Tell us about yourself and we'll suggest the best DGroups for you.",
      logoUrl: settings?.joinPageLogoUrl || null,
      bannerUrl: settings?.joinPageBackgroundImageUrl || null,
      primaryColor: settings?.joinPageAccentColor || null,
    },
    lifeStages,
  }
}

export default async function JoinSmallGroupPage() {
  const { fallback, lifeStages } = await getPageData()

  const formConfig = await getFormConfig("JoinSmallGroup")
  if (!formConfig.isOpen) return <FormClosed />

  const { title, description, logoUrl, bannerUrl: backgroundImageUrl, primaryColor: accentColor } =
    resolveFormTheme(formConfig, fallback)

  const hasBg = !!backgroundImageUrl || !!accentColor

  return (
    <div className="relative min-h-svh bg-muted">
      {backgroundImageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundImageUrl}
            alt=""
            className="fixed inset-0 h-full w-full object-cover"
          />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}

      {/* Branded header band */}
      <div
        className="relative px-6 pt-8 pb-20 text-center"
        style={!backgroundImageUrl && accentColor ? { backgroundColor: accentColor } : undefined}
      >
        <div className="relative mx-auto w-full max-w-md">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={title ?? ""}
              className="mx-auto mb-4 size-20 rounded-xl object-contain"
              style={hasBg ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
            />
          )}
          <h1 className={`text-2xl font-bold ${hasBg ? "text-white" : ""}`}>{title}</h1>
          <p className={`mt-1 text-sm ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
            {description}
          </p>
        </div>
      </div>

      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-12 min-h-[calc(100svh-(--spacing(8)))]">
        <div className="w-full max-w-md">
          <JoinForm lifeStages={lifeStages} />
        </div>
      </div>
    </div>
  )
}
