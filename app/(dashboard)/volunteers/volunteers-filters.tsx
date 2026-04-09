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

type ScopeOption = { id: string; name: string }

type VolunteersFiltersProps = {
  ministries: ScopeOption[]
  events: ScopeOption[]
  search: string
  status: string
  ministryId: string
  eventId: string
}

export function VolunteersFilters({
  ministries,
  events,
  search,
  status,
  ministryId,
  eventId,
}: VolunteersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const hasFilters = search || status || ministryId || eventId

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, status, ministryId, eventId, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.status) params.set("status", current.status)
    if (current.ministryId) params.set("ministryId", current.ministryId)
    if (current.eventId) params.set("eventId", current.eventId)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    // Selecting a ministry clears eventId and vice versa
    if (key === "ministryId" && value) {
      router.replace(buildUrl({ ministryId: value, eventId: "" }))
    } else if (key === "eventId" && value) {
      router.replace(buildUrl({ eventId: value, ministryId: "" }))
    } else {
      router.replace(buildUrl({ [key]: value }))
    }
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
        value={ministryId || "all"}
        onValueChange={(v) => setFilter("ministryId", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Ministry" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Ministries</SelectItem>
          {ministries.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
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
