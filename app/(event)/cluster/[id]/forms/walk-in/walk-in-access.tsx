"use client"

import * as React from "react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Public access for the cluster day's door form (CCF-133).
 *
 * Separate from the shared form's switch on purpose: the shared form can close
 * the night before while the door still runs, and the door can close at the end
 * of the day while pre-registration for the next one stays open.
 *
 * Starts closed. The link registers *and* records attendance in one submit, so
 * it is opened for the day rather than left standing.
 */
export function ClusterWalkInAccess({
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
    const result = await updateEventCluster(clusterId, { walkInIsOpen: next })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setIsOpen(next)
    toast.success(next ? "Walk-in is open" : "Walk-in is closed")
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Public access"
      description={
        isOpen
          ? "The walk-in link is live. It reuses an existing registration instead of erroring and checks the person in immediately."
          : "The walk-in link is closed. Open it for the day when staff are ready at the door."
      }
      control={<Switch checked={isOpen} onCheckedChange={handleToggle} disabled={saving} />}
    >
      {isOpen ? (
        <a
          href={publicPath}
          className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
        >
          View walk-in form
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          Turn on Public access to get the link.
        </p>
      )}
    </SettingCard>
  )
}
