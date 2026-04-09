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

type GuestsFiltersProps = {
  lifeStages: LifeStageOption[]
  search: string
  lifeStageId: string
  gender: string
}

export function GuestsFilters({
  lifeStages,
  search,
  lifeStageId,
  gender,
}: GuestsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const hasFilters = search || lifeStageId || gender

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, lifeStageId, gender, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.lifeStageId) params.set("lifeStageId", current.lifeStageId)
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
        placeholder="Search guests..."
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
