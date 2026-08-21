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

type CommitteeOption = { id: string; name: string; eventId: string }

type Props = {
  committees: CommitteeOption[]
  events: { id: string; name: string }[]
  search: string
  status: string
  committeeId: string
  /** Carried through every filter change — it is which *list* you're on, not a filter on it. */
  scope: "day" | "all"
}

/**
 * Filters for the day's serving team.
 *
 * The page has read `search`, `status` and `committeeId` since it was written and
 * `getClusterVolunteerPool` has always honoured them; there was simply no control
 * that set them, so the whole filter was reachable only by editing the URL.
 *
 * `scope` rides along through every change and through Clear. It reads like a
 * filter and isn't one — it selects which of two lists you are looking at, and
 * clearing your filters on "All rosters" should leave you on all rosters. Dropping
 * it would bounce you back to the day's list mid-search.
 *
 * Committees are labelled with their ministry when the day has more than one
 * event: both ministries commonly run a "Logistics", and two identical options in
 * one dropdown is an unanswerable choice.
 */
export function ClusterVolunteersFilters({
  committees,
  events,
  search,
  status,
  committeeId,
  scope,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [status, committeeId].filter(Boolean).length
  const hasFilters = Boolean(search) || activeCount > 0

  const eventNames = new Map(events.map((e) => [e.id, e.name]))
  const qualify = events.length > 1

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, status, committeeId, ...overrides }
    if (scope === "all") params.set("scope", "all")
    if (current.search) params.set("search", current.search)
    if (current.status) params.set("status", current.status)
    if (current.committeeId) params.set("committeeId", current.committeeId)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search volunteers..."
      onSearch={(value) => router.replace(buildUrl({ search: value }))}
      activeCount={activeCount}
      hasActive={hasFilters}
      onClear={() =>
        router.replace(buildUrl({ search: "", status: "", committeeId: "" }))
      }
    >
      <FilterField label="Status">
        <Select
          value={status || "all"}
          onValueChange={(v) =>
            router.replace(buildUrl({ status: v === "all" ? "" : v }))
          }
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
            onValueChange={(v) =>
              router.replace(buildUrl({ committeeId: v === "all" ? "" : v }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Committee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Committees</SelectItem>
              {committees.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {qualify ? `${c.name} · ${eventNames.get(c.eventId) ?? ""}` : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}
    </FilterBar>
  )
}
