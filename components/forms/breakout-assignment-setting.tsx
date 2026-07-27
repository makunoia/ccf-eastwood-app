"use client"

import * as React from "react"
import { IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { setRegistrationFormModule } from "@/app/(dashboard)/events/module-actions"

/**
 * Auto-assign breakout groups on submit. This is a placement *behavior*, not a
 * form section — which sections and fields the form collects lives in the
 * per-context builder (`EventFormBuilder`).
 */
export function BreakoutAssignmentSetting({
  eventId,
  initial,
}: {
  eventId: string
  initial: boolean
}) {
  const [enabled, setEnabled] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)

  async function handleToggle() {
    const next = !enabled
    setSaving(true)
    const result = await setRegistrationFormModule(eventId, "AutoAssignBreakout", next)
    setSaving(false)
    if (result.success) {
      setEnabled(next)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <section className="max-w-2xl space-y-4">
      <div>
        <h3 className="type-label text-muted-foreground">Breakout assignment</h3>
      </div>
      <SettingCard
        icon={IconSparkles}
        title="Automatically assign breakout groups"
        description="On submit, place each registrant into the best-fit breakout group based on Gender, Age, and remaining capacity. When off, registrants choose their own group — enable the Breakout Group selection section to let them pick."
        control={
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} />
        }
      />
    </section>
  )
}
