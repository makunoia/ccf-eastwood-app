"use client"

import * as React from "react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { setBreakoutGroupEnabled } from "@/app/(dashboard)/events/breakout-actions"
import type { BreakoutSurface } from "@/lib/breakouts/owner"

type Props = {
  groupId: string
  surface: BreakoutSurface
  isEnabled: boolean
  /** Named in the aria-label — an in-table switch has no visible label of its own. */
  groupName: string
  /** Adds the "On"/"Off" word beside the switch. Off in the table, where the column header carries it. */
  showLabel?: boolean
}

/**
 * The on/off switch for one breakout group, shared by the list table, the mobile
 * card list and the group detail header.
 *
 * Optimistic and reverting, following `app/(dashboard)/forms/forms-list.tsx`.
 * Plain `useState` rather than `useTransition` deliberately: an async transition
 * stays pending until everything it schedules settles, including the server
 * revalidation, which would freeze the switch for the whole round trip this is
 * meant to hide.
 *
 * Mount it with a key that includes `isEnabled` so a server-driven change
 * (someone else's edit, a router refresh) resyncs the local state.
 */
export function BreakoutEnabledSwitch({
  groupId,
  surface,
  isEnabled,
  groupName,
  showLabel = false,
}: Props) {
  const [enabled, setEnabled] = React.useState(isEnabled)
  const [pending, setPending] = React.useState(false)

  async function handleToggle(next: boolean) {
    setPending(true)
    setEnabled(next)
    const result = await setBreakoutGroupEnabled(groupId, surface.owner, next)
    setPending(false)
    if (result.success) {
      toast.success(
        next
          ? `${groupName} is on — it can receive people again.`
          : `${groupName} is off — no new people will be placed here.`
      )
    } else {
      setEnabled(!next)
      toast.error(result.error)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={pending}
        aria-label={`${enabled ? "Disable" : "Enable"} ${groupName}`}
      />
      {showLabel && (
        <span className="text-sm text-muted-foreground">{enabled ? "On" : "Off"}</span>
      )}
    </div>
  )
}
