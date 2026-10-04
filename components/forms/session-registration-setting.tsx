"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { setSessionRegistration } from "@/app/(dashboard)/events/form-config-actions"

export function SessionRegistrationSetting({ owner, enabled, sessionLabel }: {
  owner: { eventId: string } | { clusterId: string }
  enabled: boolean
  sessionLabel: string
}) {
  const router = useRouter()
  const [saving, startTransition] = React.useTransition()

  function handleChange(value: boolean) {
    startTransition(async () => {
      const result = await setSessionRegistration(owner, value)
      if (!result.success) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Session registration"
      description="Let new and returning participants register for a session, including volunteers attending as participants."
      control={
        <Switch
          checked={enabled}
          disabled={saving}
          aria-label="Enable session registration"
          onCheckedChange={handleChange}
        />
      }
    >
      <div className="mt-1 border-t pt-4">
        <p className="text-sm font-medium text-muted-foreground">
          {"eventId" in owner ? "Active session" : "Linked sessions"}
        </p>
        <p className="mt-1 text-xl font-semibold leading-snug text-foreground text-pretty">{sessionLabel}</p>
        <div className="mt-3 space-y-1 text-sm leading-relaxed text-muted-foreground">
          <p>{"eventId" in owner ? "Uses the latest session created." : "Uses the sessions linked to this Event Day."}</p>
          <p>Attendance is recorded separately at check-in.</p>
        </div>
      </div>
    </SettingCard>
  )
}
