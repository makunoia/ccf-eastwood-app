"use client"

import { usePathname, useRouter } from "next/navigation"
import { IconX } from "@tabler/icons-react"
import { SearchInput } from "@/components/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type MinistryOption = { id: string; name: string }

type EventsFiltersProps = {
  ministries: MinistryOption[]
  search: string
  ministryId: string
  type: string
  dateFrom: string
  dateTo: string
}

export function EventsFilters({
  ministries,
  search,
  ministryId,
  type,
  dateFrom,
  dateTo,
}: EventsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const hasFilters = search || ministryId || type || dateFrom || dateTo

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, ministryId, type, dateFrom, dateTo, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.ministryId) params.set("ministryId", current.ministryId)
    if (current.type) params.set("type", current.type)
    if (current.dateFrom) params.set("dateFrom", current.dateFrom)
    if (current.dateTo) params.set("dateTo", current.dateTo)
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
        placeholder="Search events..."
        onChange={(value) => setFilter("search", value)}
        className="min-w-48"
      />

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
        value={type || "all"}
        onValueChange={(v) => setFilter("type", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="OneTime">One-time</SelectItem>
          <SelectItem value="MultiDay">Multi-day</SelectItem>
          <SelectItem value="Recurring">Recurring</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setFilter("dateFrom", e.target.value)}
          className="w-36 h-9"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setFilter("dateTo", e.target.value)}
          className="w-36 h-9"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <IconX className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
