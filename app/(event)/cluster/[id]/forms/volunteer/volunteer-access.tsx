"use client"

import * as React from "react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Public access for the day's shared volunteer form.
 *
 * A fourth switch beside the shared form, the door and the kiosk, because
 * serving teams are recruited on their own timetable: sign-up opens weeks before
 * anyone can register to attend, and closes once the roster is full while the
 * attendee form is still going.
 */
export function ClusterVolunteerAccess({
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
    const result = await updateEventCluster(clusterId, { volunteerIsOpen: next })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setIsOpen(next)
    toast.success(next ? "Volunteer sign-up is open" : "Volunteer sign-up is closed")
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Public access"
      description={
        isOpen
          ? "The sign-up link is live. Everyone who signs up through it is tracked as serving on this day."
          : "The sign-up link is closed. Open it while you're recruiting the day's team."
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
          View volunteer form
          {/* A public form opened alongside this screen — same treatment as the
              walk-in and check-in links, hint included. */}
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
