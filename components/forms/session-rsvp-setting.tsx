"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { setRegistrationRsvp } from "@/app/(dashboard)/events/form-config-actions"

export function SessionRsvpSetting({ owner, enabled, sessionLabel }: {
  owner: { eventId: string } | { clusterId: string }
  enabled: boolean
  sessionLabel: string
}) {
  const router = useRouter()
  const [saving, startTransition] = React.useTransition()

  function handleChange(value: boolean) {
    startTransition(async () => {
      const result = await setRegistrationRsvp(owner, value)
      if (!result.success) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Session RSVP"
      description="Registration confirms RSVP for the active session. Returning participants can register again; volunteers can choose to attend as participants. RSVP does not check anyone in."
      control={
        <Switch
          checked={enabled}
          disabled={saving}
          aria-label="Registration confirms RSVP for the active session"
          onCheckedChange={handleChange}
        />
      }
    >
      <p className="text-sm text-muted-foreground">
        {"eventId" in owner
          ? "Active session follows the latest session created: "
          : "RSVP uses this day's linked sessions: "}
        {sessionLabel}
      </p>
    </SettingCard>
  )
}
