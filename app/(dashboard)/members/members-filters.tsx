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

  const hasFilters = search || lifeStageId || smallGroupId || gender

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
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        defaultValue={search}
        placeholder="Search members..."
        onChange={(value) => setFilter("search", value)}
        className="min-w-48"
      />

      <Select
        value={lifeStageId || "all"}
        onValueChange={(v) => setFilter("lifeStageId", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-40">
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

      <Select
        value={smallGroupId || "all"}
        onValueChange={(v) => setFilter("smallGroupId", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Small Group" />
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

      <Select
        value={gender || "all"}
        onValueChange={(v) => setFilter("gender", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Gender" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Genders</SelectItem>
          <SelectItem value="Male">Male</SelectItem>
          <SelectItem value="Female">Female</SelectItem>
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
