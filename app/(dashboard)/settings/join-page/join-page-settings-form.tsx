"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LogoUploader } from "@/components/logo-uploader"
import { saveJoinPageSettings, type JoinPageSettingsValues } from "./actions"

export function JoinPageSettingsForm({ initial }: { initial: JoinPageSettingsValues }) {
  const [form, setForm] = useState<JoinPageSettingsValues>(initial)
  const [saving, setSaving] = useState(false)

  function set(key: keyof JoinPageSettingsValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = await saveJoinPageSettings(form)
    setSaving(false)
    if (result.success) {
      toast.success("Settings saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="joinPageTitle">Page Title</Label>
          <Input
            id="joinPageTitle"
            value={form.joinPageTitle}
            onChange={(e) => set("joinPageTitle", e.target.value)}
            placeholder="Find Your DGroup"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="joinPageDescription">Description</Label>
          <Textarea
            id="joinPageDescription"
            value={form.joinPageDescription}
            onChange={(e) => set("joinPageDescription", e.target.value)}
            placeholder="Tell us about yourself and we'll suggest the best DGroups for you."
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <LogoUploader
            label="Logo"
            value={form.joinPageLogoUrl || null}
            onChange={(url) => set("joinPageLogoUrl", url ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            Shown in the header of the public join page. Displays as a small square icon above the title.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <LogoUploader
            label="Background Image"
            value={form.joinPageBackgroundImageUrl || null}
            onChange={(url) => set("joinPageBackgroundImageUrl", url ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            Full-cover background behind the header. Leave blank to use the accent color or default background.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="joinPageAccentColor">Accent Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="joinPageAccentColorPicker"
              value={form.joinPageAccentColor || "#000000"}
              onChange={(e) => set("joinPageAccentColor", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
            />
            <Input
              id="joinPageAccentColor"
              value={form.joinPageAccentColor}
              onChange={(e) => set("joinPageAccentColor", e.target.value)}
              placeholder="#3b82f6"
              className="w-36 font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Used for the header background when no background image is set. Leave blank for the default muted background.
          </p>
        </div>
      </div>

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  )
}
