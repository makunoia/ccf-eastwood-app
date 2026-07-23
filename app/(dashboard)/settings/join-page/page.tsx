import type { Metadata } from "next"
import { db } from "@/lib/db"
import { JoinPageSettingsForm } from "./join-page-settings-form"
import type { JoinPageSettingsValues } from "./actions"

export const metadata: Metadata = {
  title: "Join Page · Settings",
}

async function getSettings(): Promise<JoinPageSettingsValues> {
  const row = await db.siteSettings.findUnique({ where: { id: "singleton" } })
  return {
    joinPageTitle: row?.joinPageTitle ?? "Find Your DGroup",
    joinPageDescription:
      row?.joinPageDescription ??
      "Tell us about yourself and we'll suggest the best DGroups for you.",
    joinPageLogoUrl: row?.joinPageLogoUrl ?? "",
    joinPageBackgroundImageUrl: row?.joinPageBackgroundImageUrl ?? "",
    joinPageAccentColor: row?.joinPageAccentColor ?? "",
  }
}

export default async function JoinPageSettingsPage() {
  const settings = await getSettings()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="type-headline">Join Page</h2>
        <p className="text-sm text-muted-foreground">
          Customize the public page where guests can find and request to join a DGroup.
        </p>
      </div>
      <JoinPageSettingsForm initial={settings} />
    </div>
  )
}
