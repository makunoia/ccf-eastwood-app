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
type SmallGroupOption = { id: string; name: string }

type MembersFiltersProps = {
  lifeStages: LifeStageOption[]
  smallGroups: SmallGroupOption[]
  search: string
  lifeStageId: string
  smallGroupId: string
  gender: string
}

export function MembersFilters({
  lifeStages,
  smallGroups,
  search,
  lifeStageId,
  smallGroupId,
  gender,
}: MembersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [lifeStageId, smallGroupId, gender].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, lifeStageId, smallGroupId, gender, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.lifeStageId) params.set("lifeStageId", current.lifeStageId)
    if (current.smallGroupId) params.set("smallGroupId", current.smallGroupId)
    if (current.gender) params.set("gender", current.gender)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search members..."
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

      <FilterField label="DGroup">
        <Select
          value={smallGroupId || "all"}
          onValueChange={(v) => setFilter("smallGroupId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="DGroup" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {smallGroups.map((sg) => (
              <SelectItem key={sg.id} value={sg.id}>
                {sg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Gender">
        <Select
          value={gender || "all"}
          onValueChange={(v) => setFilter("gender", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
    </FilterBar>
  )
}
