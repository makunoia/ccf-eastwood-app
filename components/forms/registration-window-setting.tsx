"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingCard } from "@/components/ui/setting-card"
import { updateRegistrationWindow } from "@/app/(dashboard)/events/actions"
import type { RegistrationWindowValues } from "@/lib/validations/event"

/**
 * The dates registration opens and closes, shown beneath the form's open/closed
 * switch because the two answer the same question on different timescales: the
 * switch is the manual override, this is the schedule.
 *
 * Either side may be left blank for an unbounded window — the same rule
 * `isWithinRegistrationWindow` applies. Staff walk-ins are always exempt.
 */
export function RegistrationWindowSetting({
  eventId,
  initial,
}: {
  eventId: string
  initial: RegistrationWindowValues
}) {
  const [form, setForm] = React.useState<RegistrationWindowValues>(initial)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  function set(key: keyof RegistrationWindowValues, value: string) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateRegistrationWindow(eventId, form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Registration window saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <SettingCard
      title="Registration window"
      description="When the public form accepts sign-ups. Leave a date blank for no limit on that side — staff walk-ins are always allowed."
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="registrationStart">Opens</Label>
          <Input
            id="registrationStart"
            type="date"
            value={form.registrationStart}
            onChange={(e) => set("registrationStart", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="registrationEnd">Closes</Label>
          <Input
            id="registrationEnd"
            type="date"
            value={form.registrationEnd}
            onChange={(e) => set("registrationEnd", e.target.value)}
          />
        </div>
      </div>

      {dirty && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save window"}
        </Button>
      )}
    </SettingCard>
  )
}
