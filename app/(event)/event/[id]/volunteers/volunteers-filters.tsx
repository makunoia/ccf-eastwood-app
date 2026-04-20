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

  const hasFilters = search || status || committeeId

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

      {committees.length > 0 && (
        <Select
          value={committeeId || "all"}
          onValueChange={(v) => setFilter("committeeId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-40">
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
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <IconX className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
