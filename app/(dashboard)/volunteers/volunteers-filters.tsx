"use client"

import { usePathname, useRouter } from "next/navigation"
import { IconX } from "@tabler/icons-react"
import { SearchInput } from "@/components/search-input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type VolunteersFiltersProps = {
  events: { id: string; name: string }[]
  search: string
  status: string
  eventId: string
}

export function VolunteersFilters({
  events,
  search,
  status,
  eventId,
}: VolunteersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const hasFilters = search || status || eventId

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, status, eventId, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.status) params.set("status", current.status)
    if (current.eventId) params.set("eventId", current.eventId)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        defaultValue={search}
        placeholder="Search volunteers..."
        onChange={(value) => setFilter("search", value)}
        className="min-w-48"
      />

      <Select
        value={status || "all"}
        onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="Pending">Pending</SelectItem>
          <SelectItem value="Confirmed">Confirmed</SelectItem>
          <SelectItem value="Rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={eventId || "all"}
        onValueChange={(v) => setFilter("eventId", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Event" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Events</SelectItem>
          {events.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <IconX className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
