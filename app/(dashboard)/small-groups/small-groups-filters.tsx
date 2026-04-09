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

type SmallGroupsFiltersProps = {
  lifeStages: LifeStageOption[]
  search: string
  lifeStageId: string
  genderFocus: string
  meetingFormat: string
}

export function SmallGroupsFilters({
  lifeStages,
  search,
  lifeStageId,
  genderFocus,
  meetingFormat,
}: SmallGroupsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const hasFilters = search || lifeStageId || genderFocus || meetingFormat

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, lifeStageId, genderFocus, meetingFormat, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.lifeStageId) params.set("lifeStageId", current.lifeStageId)
    if (current.genderFocus) params.set("genderFocus", current.genderFocus)
    if (current.meetingFormat) params.set("meetingFormat", current.meetingFormat)
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
        placeholder="Search groups or leaders..."
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
        value={genderFocus || "all"}
        onValueChange={(v) => setFilter("genderFocus", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Gender Focus" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Genders</SelectItem>
          <SelectItem value="Male">Men</SelectItem>
          <SelectItem value="Female">Women</SelectItem>
          <SelectItem value="Mixed">Mixed</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={meetingFormat || "all"}
        onValueChange={(v) => setFilter("meetingFormat", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Format" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Formats</SelectItem>
          <SelectItem value="Online">Online</SelectItem>
          <SelectItem value="InPerson">In Person</SelectItem>
          <SelectItem value="Hybrid">Hybrid</SelectItem>
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
