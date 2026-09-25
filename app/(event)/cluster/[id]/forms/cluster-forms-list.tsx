"use client"

import * as React from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconDoorEnter, IconExternalLink, IconForms, IconHeart, IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"
import {
  clusterCheckinPath,
  clusterRegisterPath,
  clusterVolunteerPath,
  clusterWalkInPath,
} from "@/lib/public-routes"

/**
 * Cluster Forms groups the shared registration and arrival surfaces separately
 * from the optional Collab volunteer form.
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
  publicToken,
  initialIsOpen,
  walkInIsOpen,
  checkInIsOpen,
  volunteerIsOpen,
  isCollab,
  eventCount,
}: {
  clusterId: string
  publicToken: string
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
  const publicBase = clusterRegisterPath(publicToken)
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
    <div className="flex max-w-5xl flex-col gap-7">
      <section aria-labelledby="cluster-arrival-heading">
        <h2 id="cluster-arrival-heading" className="mb-2 text-sm font-semibold">Registration &amp; arrival</h2>
        <ul className="divide-y rounded-lg border bg-card">
          <ClusterFormRow
            icon={IconForms}
            title={titleLink(`${base}/registration`, "Registration Form")}
            description="The shared public form for the whole day."
            publicHref={publicBase}
            status={isOpen ? "On" : "Off"}
            control={(
              <Switch
                checked={isOpen}
                onCheckedChange={handleToggle}
                disabled={pending}
                aria-label={`${isOpen ? "Turn off" : "Turn on"} public access for Registration Form`}
              />
            )}
          />
          {/* These forms have their own access controls on their configuration screens. */}
          <ClusterFormRow
            icon={IconUserPlus}
            title={titleLink(`${base}/walk-in`, "Walk-in Registration")}
            description="Register and check in someone at the door."
            publicHref={clusterWalkInPath(publicToken)}
            status={walkInIsOpen ? "On" : "Off"}
          />
          <ClusterFormRow
            icon={IconDoorEnter}
            title={titleLink(`${base}/check-in`, "Check-in")}
            description={`One kiosk for the day across ${eventCount} ${eventCount === 1 ? "event" : "events"}.`}
            publicHref={clusterCheckinPath(publicToken)}
            status={checkInIsOpen ? "On" : "Off"}
          />
        </ul>
      </section>
      {isCollab && (
        <section aria-labelledby="cluster-serving-heading">
          <h2 id="cluster-serving-heading" className="mb-2 text-sm font-semibold">Serving</h2>
          <ul className="divide-y rounded-lg border bg-card">
            <ClusterFormRow
              icon={IconHeart}
              title={titleLink(`${base}/volunteer`, "Volunteer Sign-Up")}
              description="The day's serving team signs up here, routed by ministry."
              publicHref={clusterVolunteerPath(publicToken)}
              status={volunteerIsOpen ? "On" : "Off"}
            />
          </ul>
        </section>
      )}
    </div>
  )
}

function ClusterFormRow({
  icon: Icon,
  title,
  description,
  publicHref,
  status,
  control,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: ReactNode
  description: string
  publicHref: string
  status: string
  control?: ReactNode
}) {
  return (
    <li className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-12">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <p className="mt-1 max-w-[58ch] text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8 sm:justify-end sm:pl-0 sm:pt-1">
        <a
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          View <IconExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only"> public form (opens in a new tab)</span>
        </a>
        <span className="text-sm text-muted-foreground">{status}</span>
        {control}
      </div>
    </li>
  )
}
