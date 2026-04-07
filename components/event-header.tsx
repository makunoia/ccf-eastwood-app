"use client"

import { usePathname } from "next/navigation"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const SECTION_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  registrants: "Registrants",
  sessions: "Sessions",
  breakouts: "Breakout Groups",
  volunteers: "Volunteers",
  baptism: "Baptism",
  embarkation: "Embarkation",
  settings: "Settings",
}

type EventHeaderProps = {
  eventId: string
  eventType: "OneTime" | "MultiDay" | "Recurring"
}

export function EventHeader({ eventId, eventType }: EventHeaderProps) {
  const pathname = usePathname()
  // pathname is like /event/[id]/section or /event/[id]/sessions/[occurrenceId]
  const parts = pathname.split("/")
  // parts: ["", "event", id, section, ...]
  const section = parts[3] ?? ""
  const title = SECTION_TITLES[section] ?? "Event"

  const isRegistrantsPage = section === "registrants"

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
        <h1 className="text-base font-medium">{title}</h1>

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
