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

type SmallGroupsFiltersProps = {
  lifeStages: LifeStageOption[]
  search: string
  lifeStageId: string
  genderFocus: string
  meetingFormat: string
  status: string
}

export function SmallGroupsFilters({
  lifeStages,
  search,
  lifeStageId,
  genderFocus,
  meetingFormat,
  status,
}: SmallGroupsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [lifeStageId, genderFocus, meetingFormat, status].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, lifeStageId, genderFocus, meetingFormat, status, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.lifeStageId) params.set("lifeStageId", current.lifeStageId)
    if (current.genderFocus) params.set("genderFocus", current.genderFocus)
    if (current.meetingFormat) params.set("meetingFormat", current.meetingFormat)
    if (current.status) params.set("status", current.status)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search groups or leaders..."
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

      <FilterField label="Gender Focus">
        <Select
          value={genderFocus || "all"}
          onValueChange={(v) => setFilter("genderFocus", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Gender Focus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="Male">Men</SelectItem>
            <SelectItem value="Female">Women</SelectItem>
            <SelectItem value="Mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Format">
        <Select
          value={meetingFormat || "all"}
          onValueChange={(v) => setFilter("meetingFormat", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="Online">Online</SelectItem>
            <SelectItem value="InPerson">In Person</SelectItem>
            <SelectItem value="Hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

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
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
    </FilterBar>
  )
}
