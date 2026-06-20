"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LogoUploader } from "@/components/logo-uploader"
import {
  updateRegistrationPage,
  type RegistrationPageValues,
} from "@/app/(dashboard)/events/registration-page-actions"

export function RegistrationPageTab({
  eventId,
  initial,
}: {
  eventId: string
  initial: RegistrationPageValues
}) {
  const [form, setForm] = React.useState<RegistrationPageValues>(initial)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  function set<K extends keyof RegistrationPageValues>(key: K, value: RegistrationPageValues[K]) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateRegistrationPage(eventId, form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Page settings saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs text-muted-foreground">
          Customize the header shown on this event&apos;s public registration and check-in pages. Leave a field blank to use the default.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="regPageTitle">Page Title</Label>
        <Input
          id="regPageTitle"
          value={form.registrationPageTitle}
          onChange={(e) => set("registrationPageTitle", e.target.value)}
          placeholder="e.g. Youth Camp 2026 — Sign Up"
        />
        <p className="text-xs text-muted-foreground">
          Defaults to &ldquo;[Event Name] Registration&rdquo; when blank.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="regPageDescription">Description</Label>
        <Textarea
          id="regPageDescription"
          value={form.registrationPageDescription}
          onChange={(e) => set("registrationPageDescription", e.target.value)}
          placeholder="e.g. Fill in your details below to secure your slot."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Shown below the title. Defaults to the ministry and date when blank.
        </p>
      </div>

      <div className="space-y-2">
        <LogoUploader
          label="Banner Image"
          value={form.registrationPageBannerUrl || null}
          onChange={(url) => {
            setDirty(true)
            setForm((prev) => ({ ...prev, registrationPageBannerUrl: url ?? "" }))
          }}
        />
        <p className="text-xs text-muted-foreground">
          Full-cover background behind the header. Leave blank to use the event&apos;s branding color.
        </p>
      </div>

      {dirty && (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save page settings"}
        </Button>
      )}
    </div>
  )
}
