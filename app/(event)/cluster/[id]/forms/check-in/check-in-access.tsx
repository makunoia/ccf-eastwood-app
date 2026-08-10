"use client"

import * as React from "react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Public access for the cluster day's check-in kiosk.
 *
 * A third switch beside the shared form's and the door's, because the three run
 * on different schedules: registration usually closes the night before, while
 * the kiosk and the door open together in the morning.
 *
 * Starts closed. The link records attendance, so it is opened for the day rather
 * than left standing.
 */
export function ClusterCheckInAccess({
  clusterId,
  publicPath,
  initialIsOpen,
}: {
  clusterId: string
  publicPath: string
  initialIsOpen: boolean
}) {
  const [isOpen, setIsOpen] = React.useState(initialIsOpen)
  const [saving, setSaving] = React.useState(false)

  async function handleToggle() {
    const next = !isOpen
    setSaving(true)
    const result = await updateEventCluster(clusterId, { checkInIsOpen: next })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setIsOpen(next)
    toast.success(next ? "Check-in is open" : "Check-in is closed")
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Public access"
      description={
        isOpen
          ? "The day's check-in link is live. It finds someone once and records their attendance across every event of the day they're registered for."
          : "The day's check-in link is closed. Open it when staff are ready at the door."
      }
      control={<Switch checked={isOpen} onCheckedChange={handleToggle} disabled={saving} />}
    >
      {isOpen ? (
        <a
          href={publicPath}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
        >
          View check-in form
          {/* Worked alongside this screen, so it opens in a new tab — said out
              loud for screen readers, the way the board's Shortcuts do. */}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          Turn on Public access to get the link.
        </p>
      )}
    </SettingCard>
  )
}
