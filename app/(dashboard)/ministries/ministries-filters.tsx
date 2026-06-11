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

type LifeStageOption = { id: string; name: string }

type MinistriesFiltersProps = {
  lifeStages: LifeStageOption[]
  search: string
  lifeStageId: string
}

export function MinistriesFilters({
  lifeStages,
  search,
  lifeStageId,
}: MinistriesFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [lifeStageId].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, lifeStageId, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.lifeStageId) params.set("lifeStageId", current.lifeStageId)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search ministries..."
      onSearch={(value) => setFilter("search", value)}
      activeCount={activeCount}
      hasActive={hasFilters}
      onClear={() => router.replace(pathname)}
    >
      <FilterField label="Life Stage">
        <Select
          value={lifeStageId || "all"}
          onValueChange={(v) => setFilter("lifeStageId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Life Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Life Stages</SelectItem>
            {lifeStages.map((ls) => (
              <SelectItem key={ls.id} value={ls.id}>
                {ls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
    </FilterBar>
  )
}
