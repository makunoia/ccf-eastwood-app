"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import { setClusterCheckinOpen } from "@/app/(dashboard)/events/cluster-actions"
import { clusterCheckinSkipHint } from "@/lib/clusters/checkin-toggle"

/**
 * Public access for the cluster day's check-in kiosk — and, through it, the day.
 *
 * A third switch beside the shared form's and the door's, because the three run
 * on different schedules: registration usually closes the night before, while
 * the kiosk and the door open together in the morning.
 *
 * It now opens every member event's own check-in too. The kiosk door alone was
 * never enough to take a check-in: each event keeps its own control, and until
 * all of them were open the kiosk found the person and quietly skipped their
 * events. One switch, one trip.
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
  const router = useRouter()
  const [isOpen, setIsOpen] = React.useState(initialIsOpen)
  const [saving, setSaving] = React.useState(false)

  async function handleToggle() {
    const next = !isOpen
    setSaving(true)
    const result = await setClusterCheckinOpen(clusterId, next)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setIsOpen(next)

    // Say what the cascade did to the member events. A switch that silently
    // reaches into other events owes the staffer an account of what it touched —
    // especially when one of them needed a session created, or couldn't get one.
    const { results } = result.data
    const touched = results.filter(
      (r) => r.status === "opened" || r.status === "closed"
    ).length
    const created = results.filter((r) => r.status === "created").length
    const failed = results.filter((r) => r.status === "failed")
    const skipped = results.filter((r) => r.status === "skipped")

    const detail = [
      touched > 0 ? `${touched} ${touched === 1 ? "event" : "events"} ${next ? "opened" : "closed"}` : null,
      created > 0 ? `${created} ${created === 1 ? "session" : "sessions"} created` : null,
      ...skipped.map((r) => `${r.eventName} ${clusterCheckinSkipHint(r.reason!)}`),
      ...failed.map((r) => `${r.eventName} couldn't be updated`),
    ]
      .filter(Boolean)
      .join(" · ")

    const headline = next ? "Check-in is open" : "Check-in is closed"
    if (failed.length > 0 || skipped.length > 0) {
      toast.warning(headline, { description: detail })
    } else {
      toast.success(headline, { description: detail || undefined })
    }

    // The card below reads each member event's real state — re-read it rather
    // than let it describe the world from before this switch.
    router.refresh()
  }

  return (
    <SettingCard
      className="max-w-2xl"
      title="Public access"
      description={
        isOpen
          ? "The day's check-in link is live, and every event below is taking check-ins. It finds someone once and records their attendance across every event of the day they're registered for."
          : "The day's check-in link is closed. Opening it also opens check-in on every event below — one switch for the whole day."
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
