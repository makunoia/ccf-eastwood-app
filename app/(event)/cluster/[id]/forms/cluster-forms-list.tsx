"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconDoorEnter, IconForms, IconHeart, IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { SettingCard } from "@/components/ui/setting-card"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Cluster Forms list — same list-first pattern as the per-event Forms page:
 * rows here, each opening its own config page.
 */

function titleLink(href: string, label: string) {
  return (
    <Link
      href={href}
      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
    >
      {label}
    </Link>
  )
}

export function ClusterFormsList({
  clusterId,
  initialIsOpen,
  walkInIsOpen,
  checkInIsOpen,
  volunteerIsOpen,
  isCollab,
  eventCount,
}: {
  clusterId: string
  initialIsOpen: boolean
  walkInIsOpen: boolean
  checkInIsOpen: boolean
  volunteerIsOpen: boolean
  /** A shared volunteer form only exists on a Collab day — see its page. */
  isCollab: boolean
  eventCount: number
}) {
  const router = useRouter()
  const base = `/cluster/${clusterId}/forms`
  const [isOpen, setIsOpen] = React.useState(initialIsOpen)
  const [pending, setPending] = React.useState(false)

  async function handleToggle(next: boolean) {
    setPending(true)
    // Optimistic — revert on failure.
    setIsOpen(next)
    const result = await updateEventCluster(clusterId, { isOpen: next })
    setPending(false)
    if (result.success) {
      toast.success(next ? "Form opened" : "Form closed")
      router.refresh()
    } else {
      setIsOpen(!next)
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingCard
        icon={IconForms}
        title={titleLink(`${base}/registration`, "Registration Form")}
        description="The shared public form for the whole day — register once, tick the events you're attending."
        control={
          <div className="flex items-center gap-2">
            <span className="w-12 text-right text-sm text-muted-foreground">
              {isOpen ? "Open" : "Closed"}
            </span>
            <Switch
              checked={isOpen}
              onCheckedChange={handleToggle}
              disabled={pending}
              aria-label={`${isOpen ? "Close" : "Open"} Registration Form`}
            />
          </div>
        }
      />

      {/* Each of the three surfaces owns its switch, so each row reports its own
          state. The switches themselves live on the config pages; only the
          shared form's is duplicated here, where it is flipped most often. */}
      <SettingCard
        icon={IconUserPlus}
        title={titleLink(`${base}/walk-in`, "Walk-in Registration")}
        description="The same form in door mode — staff-supervised, registers and checks people in on the spot."
        control={
          <span className="text-sm text-muted-foreground">
            {walkInIsOpen ? "Open" : "Closed"}
          </span>
        }
      />

      {isCollab && (
        <SettingCard
          icon={IconHeart}
          title={titleLink(`${base}/volunteer`, "Volunteer Sign-Up")}
          description="The day's serving team signs up here — one form, routed by ministry, tracked against this day."
          control={
            <span className="text-sm text-muted-foreground">
              {volunteerIsOpen ? "Open" : "Closed"}
            </span>
          }
        />
      )}

      <SettingCard
        icon={IconDoorEnter}
        title={titleLink(`${base}/check-in`, "Check-in")}
        description={`One kiosk for the whole day, plus each event's own form — ${eventCount} ${
          eventCount === 1 ? "event" : "events"
        }.`}
        control={
          <span className="text-sm text-muted-foreground">
            {checkInIsOpen ? "Open" : "Closed"}
          </span>
        }
      />
    </div>
  )
}
