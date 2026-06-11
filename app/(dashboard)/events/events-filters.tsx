"use client"

import { usePathname, useRouter } from "next/navigation"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { Input } from "@/components/ui/input"
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

  const activeCount = [ministryId, type, dateFrom, dateTo].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

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
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search events..."
      onSearch={(value) => setFilter("search", value)}
      activeCount={activeCount}
      hasActive={hasFilters}
      onClear={() => router.replace(pathname)}
    >
      <FilterField label="Ministry">
        <Select
          value={ministryId || "all"}
          onValueChange={(v) => setFilter("ministryId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
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
      </FilterField>

      <FilterField label="Type">
        <Select
          value={type || "all"}
          onValueChange={(v) => setFilter("type", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="OneTime">One-time</SelectItem>
            <SelectItem value="MultiDay">Multi-day</SelectItem>
            <SelectItem value="Recurring">Recurring</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="From">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setFilter("dateFrom", e.target.value)}
          className="h-9 w-full"
        />
      </FilterField>

      <FilterField label="To">
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setFilter("dateTo", e.target.value)}
          className="h-9 w-full"
        />
      </FilterField>
    </FilterBar>
  )
}
