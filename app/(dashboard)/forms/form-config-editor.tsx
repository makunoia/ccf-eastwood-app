"use client"

import * as React from "react"
import { toast } from "sonner"
import type { FormKey } from "@/app/generated/prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SettingCard } from "@/components/ui/setting-card"
import { LogoUploader } from "@/components/logo-uploader"
import type { FormThemeField } from "@/lib/forms/registry"
import { saveFormConfig, setFormOpen, type FormConfigValues } from "./actions"

export type ThemeFormState = {
  title: string
  description: string
  logoUrl: string
  bannerUrl: string
  primaryColor: string
}

export function FormConfigEditor({
  formKey,
  eventId,
  initialIsOpen,
  initialTheme,
  themeFields,
  publicUrl,
}: {
  formKey: FormKey
  eventId: string | null
  initialIsOpen: boolean
  initialTheme: ThemeFormState
  themeFields: FormThemeField[]
  publicUrl?: string | null
}) {
  const [isOpen, setIsOpen] = React.useState(initialIsOpen)
  const [toggling, setToggling] = React.useState(false)
  const [theme, setTheme] = React.useState<ThemeFormState>(initialTheme)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  function set(key: keyof ThemeFormState, value: string) {
    setDirty(true)
    setTheme((prev) => ({ ...prev, [key]: value }))
  }

  async function handleToggleOpen() {
    const next = !isOpen
    setToggling(true)
    const result = await setFormOpen(formKey, eventId, next)
    setToggling(false)
    if (result.success) {
      setIsOpen(next)
      toast.success(next ? "Form opened" : "Form closed")
    } else {
      toast.error(result.error)
    }
  }

  async function handleSave() {
    setSaving(true)
    const values: FormConfigValues = {
      isOpen,
      ...(themeFields.includes("title") ? { title: theme.title } : {}),
      ...(themeFields.includes("description") ? { description: theme.description } : {}),
      ...(themeFields.includes("logoUrl") ? { logoUrl: theme.logoUrl } : {}),
      ...(themeFields.includes("bannerUrl") ? { bannerUrl: theme.bannerUrl } : {}),
      ...(themeFields.includes("primaryColor") ? { primaryColor: theme.primaryColor } : {}),
    }
    const result = await saveFormConfig(formKey, eventId, values)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Form settings saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Public access */}
      <SettingCard
        title="Public access"
        description={
          isOpen
            ? "This form is open — anyone with the link can use it."
            : "This form is closed — visitors see an unavailable message."
        }
        control={
          <Switch
            checked={isOpen}
            onCheckedChange={handleToggleOpen}
            disabled={toggling}
          />
        }
      >
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            View public form
          </a>
        )}
      </SettingCard>

      {/* Theme overrides */}
      {themeFields.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="type-label text-muted-foreground">Theme overrides</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Leave a field blank to use the default branding.
            </p>
          </div>

          {themeFields.includes("title") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="formTitle">Title</Label>
              <Input
                id="formTitle"
                value={theme.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Defaults to the form's standard heading"
              />
            </div>
          )}

          {themeFields.includes("description") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="formDescription">Description</Label>
              <Textarea
                id="formDescription"
                value={theme.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
              />
            </div>
          )}

          {themeFields.includes("logoUrl") && (
            <div className="flex flex-col gap-1.5">
              <LogoUploader
                label="Logo"
                value={theme.logoUrl || null}
                onChange={(url) => set("logoUrl", url ?? "")}
              />
            </div>
          )}

          {themeFields.includes("bannerUrl") && (
            <div className="flex flex-col gap-1.5">
              <LogoUploader
                label="Background Image"
                value={theme.bannerUrl || null}
                onChange={(url) => set("bannerUrl", url ?? "")}
              />
              <p className="text-xs text-muted-foreground">
                Full-cover background behind the header. Leave blank to use the color below.
              </p>
            </div>
          )}

          {themeFields.includes("primaryColor") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="formPrimaryColor">Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="formPrimaryColorPicker"
                  value={theme.primaryColor || "#000000"}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
                />
                <Input
                  value={theme.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  placeholder="#3b82f6"
                  className="w-36 font-mono"
                />
              </div>
            </div>
          )}

          {dirty && (
            <div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
