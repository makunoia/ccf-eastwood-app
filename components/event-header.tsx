"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useBreadcrumbContext } from "@/components/breadcrumb-context"

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  registrants: "Registrants",
  sessions: "Sessions",
  breakouts: "Breakout Groups",
  volunteers: "Volunteers",
  baptism: "Baptism",
  embarkation: "Embarkation",
  settings: "Settings",
  "catch-mech": "Catch Mech",
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
  new: "New",
}

type EventHeaderProps = {
  eventId: string
  eventType: "OneTime" | "MultiDay" | "Recurring"
}

export function EventHeader({ eventId, eventType: _eventType }: EventHeaderProps) {
  const pathname = usePathname()
  const { overrides } = useBreadcrumbContext()
  const segments = pathname.split("/").filter(Boolean)
  // segments: ["event", id, section, ...subs]

  const items: { label: string; href: string }[] = []
  let cumulativeHref = ""

  for (const segment of segments) {
    if (segment === "event") {
      cumulativeHref += "/event"
      items.push({ label: "Events", href: "/events" })
    } else {
      cumulativeHref += `/${segment}`
      if (SEGMENT_LABELS[segment]) {
        items.push({ label: SEGMENT_LABELS[segment], href: cumulativeHref })
      } else if (overrides[cumulativeHref]) {
        items.push({ label: overrides[cumulativeHref], href: cumulativeHref })
      }
    }
  }

  const isRegistrantsPage =
    segments[2] === "registrants" && segments.length === 3

  function copyRegistrationLink() {
    const url = `${window.location.origin}/events/${eventId}/register`
    navigator.clipboard.writeText(url)
    toast.success("Registration link copied")
  }

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {items.map((item, index) => {
              const isLast = index === items.length - 1
              return (
                <React.Fragment key={item.href}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={item.href}>{item.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>

        {isRegistrantsPage && (
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={copyRegistrationLink}>
              <IconCopy className="size-3.5" />
              Registration link
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
