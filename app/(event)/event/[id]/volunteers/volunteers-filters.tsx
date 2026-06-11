"use client"

import { usePathname, useRouter } from "next/navigation"
import { FilterBar, FilterField } from "@/components/filter-bar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CommitteeOption = { id: string; name: string }

type VolunteersFiltersProps = {
  committees: CommitteeOption[]
  search: string
  status: string
  committeeId: string
}

export function VolunteersFilters({
  committees,
  search,
  status,
  committeeId,
}: VolunteersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [status, committeeId].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, status, committeeId, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.status) params.set("status", current.status)
    if (current.committeeId) params.set("committeeId", current.committeeId)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search volunteers..."
      onSearch={(value) => setFilter("search", value)}
      activeCount={activeCount}
      hasActive={hasFilters}
      onClear={() => router.replace(pathname)}
    >
      <FilterField label="Status">
        <Select
          value={status || "all"}
          onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      {committees.length > 0 && (
        <FilterField label="Committee">
          <Select
            value={committeeId || "all"}
            onValueChange={(v) => setFilter("committeeId", v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Committee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Committees</SelectItem>
              {committees.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}
    </FilterBar>
  )
}
