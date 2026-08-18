"use client"

import * as React from "react"
import { IconX, IconAlertTriangle } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FilterField } from "@/components/filter-bar"
import { Input } from "@/components/ui/input"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { scoreBand } from "@/components/matching/factor-meta"
import { formatDayOfWeek } from "@/lib/format/schedule"
import { listBreakoutCandidates } from "@/app/(dashboard)/events/matching-actions"
import type { BreakoutCandidateList } from "@/app/(dashboard)/events/matching-actions"
import { addRegistrantsToBreakout } from "@/app/(dashboard)/events/breakout-actions"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"
import type { BreakoutSurface } from "@/lib/breakouts/owner"
import {
  filterBreakoutCandidates,
  sortCandidates,
  visibleFilters,
  activeFilterCount,
  hasAttributeFilters,
  cityOptions,
  languageOptions,
  CANDIDATE_SORT_LABELS,
  type CandidateFilters,
  type CandidateSort,
  type BreakoutCandidate,
} from "@/lib/breakouts/candidate-filters"

const ALL = "all"
const DAYS = [0, 1, 2, 3, 4, 5, 6]

/**
 * Picks registrants to add to a breakout group.
 *
 * A Sheet rather than a Dialog on purpose: the filter controls live inline in
 * the body, and nesting the shared FilterBar's drawer inside a modal would
 * stack two focus traps and two scroll locks.
 */
export function AddRegistrantSheet({
  open,
  onOpenChange,
  groupId,
  surface,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groupId: string
  surface: BreakoutSurface
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {/* Mounted only while open, so every open starts from a clean slate
            (fresh fetch, no leftover filters or selection) without an effect
            reaching back to reset state. */}
        {open && (
          <CandidatePicker groupId={groupId} surface={surface} onOpenChange={onOpenChange} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function CandidatePicker({
  groupId,
  surface,
  onOpenChange,
}: {
  groupId: string
  surface: BreakoutSurface
  onOpenChange: (v: boolean) => void
}) {
  const [data, setData] = React.useState<BreakoutCandidateList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filters, setFilters] = React.useState<CandidateFilters>({})
  const [sort, setSort] = React.useState<CandidateSort>("fit")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [showNoProfile, setShowNoProfile] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  // The input stays instant while the expensive part — rescanning and
  // re-sorting the whole pool — waits for a pause in typing.
  const [searchText, setSearchText] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(
      () => setFilters((f) => ({ ...f, search: searchText || undefined })),
      150
    )
    return () => clearTimeout(t)
  }, [searchText])

  // Fetched on mount rather than shipped with the page: the pool is only needed
  // here, and a fresh read means the list reflects adds made since page load.
  React.useEffect(() => {
    let cancelled = false
    listBreakoutCandidates(groupId, surface.owner).then((result) => {
      if (cancelled) return
      if (result.success) setData(result.data)
      else toast.error(result.error)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [groupId, surface])

  const candidates = React.useMemo(() => data?.candidates ?? [], [data])

  const shown = React.useMemo(() => {
    const matched = filterBreakoutCandidates(candidates, filters)
    return sortCandidates(matched, sort)
  }, [candidates, filters, sort])

  // Anonymous walk-ins have no profile to match on, so any attribute filter
  // drops them. Surface that instead of letting them vanish silently.
  const hiddenNoProfile = React.useMemo(() => {
    if (!hasAttributeFilters(filters)) return []
    // Role travels with search: it is answerable for a walk-in, so a walk-in the
    // role filter excluded must not reappear here as merely "no profile".
    return filterBreakoutCandidates(
      candidates.filter((c) => c.isAnonymous),
      { search: filters.search, role: filters.role }
    )
  }, [candidates, filters])

  const visible = React.useMemo(
    () => (data ? visibleFilters(data.formConfig, candidates) : []),
    [data, candidates]
  )

  // Both scan the whole pool, so they must not run on every keystroke.
  const cities = React.useMemo(() => cityOptions(candidates), [candidates])
  const languages = React.useMemo(
    () => languageOptions(candidates).map((l) => ({ value: l, label: l })),
    [candidates]
  )

  const occupancy = breakoutOccupancy({
    memberCount: data?.currentCount ?? 0,
    memberLimit: data?.memberLimit ?? null,
  })
  // Infinity keeps the `selected.size >` comparison below meaningful for an
  // uncapped group, where "remaining" is genuinely not a number.
  const remaining = occupancy.remaining ?? Infinity
  const atCapacity = occupancy.isFull
  const overCapacity = selected.size > remaining

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Adds as many of the current results as capacity allows. */
  function selectAllShown() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of shown) {
        if (next.size >= remaining) break
        next.add(c.registrantId)
      }
      return next
    })
  }

  async function handleAdd() {
    setAdding(true)
    const ids = [...selected]
    const result = await addRegistrantsToBreakout(groupId, ids, surface.owner)
    setAdding(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    const { added, failed } = result.data
    if (added > 0) {
      toast.success(`Added ${added} registrant${added !== 1 ? "s" : ""}`)
    }
    if (failed.length > 0) {
      toast.error(
        `${failed.length} could not be added`,
        { description: failed.map((f) => `${f.name} ${f.reason}`).join("; ") }
      )
    }

    // Candidates live in client state, so the flight-data refresh that updates
    // the roster won't touch this list — prune locally and keep only failures
    // selected so the admin can see what still needs attention.
    const failedIds = new Set(failed.map((f) => f.id))
    const addedIds = ids.filter((id) => !failedIds.has(id))
    setData((prev) =>
      prev
        ? {
            ...prev,
            currentCount: prev.currentCount + added,
            candidates: prev.candidates.filter((c) => !addedIds.includes(c.registrantId)),
          }
        : prev
    )
    setSelected(new Set(failed.map((f) => f.id)))

    if (failed.length === 0) onOpenChange(false)
  }

  const activeCount = activeFilterCount(filters)

  return (
    <>
      <SheetHeader className="gap-1">
        <SheetTitle>Add registrants</SheetTitle>
        <SheetDescription>
          {loading
            ? "Loading candidates…"
            : atCapacity
            ? "This group is at capacity."
            : `${data?.totalPool ?? 0} unassigned · ${
                data?.memberLimit == null
                  ? "no member cap"
                  : `${remaining} slot${remaining !== 1 ? "s" : ""} left`
              }`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        <Input
          placeholder="Search by name or mobile…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          autoFocus
        />

        <div className="flex items-center gap-2">
          {/* Outside the grid below on purpose: that grid is driven by the
              event's form config, and whether someone is serving is not a form
              field — it's true of the whole pool, walk-ins included. */}
          <Select
            value={filters.role ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                role: v === ALL ? undefined : (v as "participant" | "volunteer"),
              }))
            }
          >
            <SelectTrigger size="sm" className="w-auto gap-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All people</SelectItem>
              <SelectItem value="participant">Participants only</SelectItem>
              <SelectItem value="volunteer">Volunteers only</SelectItem>
            </SelectContent>
          </Select>
          {(activeCount > 0 || searchText) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchText("")
                setFilters({})
              }}
            >
              <IconX className="size-4" />
              Clear
            </Button>
          )}
          {activeCount > 0 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {activeCount} filter{activeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {data && visible.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {visible.includes("lifeStage") && (
              <FilterField label="Life Stage">
                <Select
                  value={filters.lifeStageId ?? ALL}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, lifeStageId: v === ALL ? undefined : v }))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {data.lifeStages.map((ls) => (
                      <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {visible.includes("gender") && (
              <FilterField label="Gender">
                <Select
                  value={filters.gender ?? ALL}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      gender: v === ALL ? undefined : (v as "Male" | "Female"),
                    }))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {/* One age control. Buckets when the church has configured them —
                that's the vocabulary admins already think in — free min/max
                otherwise. Both write the same window, so there's no way to set
                two age rules that quietly contradict each other. */}
            {visible.includes("age") &&
              (data.ageRangeBuckets.length > 0 ? (
                <FilterField label="Age">
                  <Select
                    value={filters.ageBucketId ?? ALL}
                    onValueChange={(v) =>
                      setFilters((f) => {
                        const bucket = data.ageRangeBuckets.find((b) => b.id === v)
                        if (!bucket) {
                          return {
                            ...f,
                            ageBucketId: undefined,
                            minAge: undefined,
                            maxAge: undefined,
                          }
                        }
                        return {
                          ...f,
                          ageBucketId: bucket.id,
                          minAge: bucket.minAge ?? undefined,
                          maxAge: bucket.maxAge ?? undefined,
                        }
                      })
                    }
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All</SelectItem>
                      {data.ageRangeBuckets.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              ) : (
                <FilterField label="Age">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Min"
                      className="h-9"
                      value={filters.minAge ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          minAge: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Max"
                      className="h-9"
                      value={filters.maxAge ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          maxAge: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </FilterField>
              ))}

            {visible.includes("language") && (
              <FilterField label="Language">
                <MultiSelect
                  options={languages}
                  value={filters.languages ?? []}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, languages: v.length > 0 ? v : undefined }))
                  }
                  placeholder="Any language"
                  className="w-full"
                />
              </FilterField>
            )}

            {visible.includes("workCity") && (
              <FilterField label="Work City">
                <Select
                  value={filters.workCity ?? ALL}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, workCity: v === ALL ? undefined : v }))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {cities.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {visible.includes("meetingPreference") && (
              <FilterField label="Meeting Preference">
                <Select
                  value={filters.meetingPreference ?? ALL}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      meetingPreference:
                        v === ALL ? undefined : (v as "Online" | "Hybrid" | "InPerson"),
                    }))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                    <SelectItem value="InPerson">In-person</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {visible.includes("schedule") && (
              <FilterField label="Available On">
                <Select
                  value={
                    filters.scheduleDayOfWeek === undefined
                      ? ALL
                      : String(filters.scheduleDayOfWeek)
                  }
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      scheduleDayOfWeek: v === ALL ? undefined : Number(v),
                    }))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any day</SelectItem>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {formatDayOfWeek(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">
              {shown.length} result{shown.length !== 1 ? "s" : ""}
              {data?.truncated && ` of first ${candidates.length}`}
            </span>
            {shown.length > 0 && !atCapacity && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={selectAllShown}>
                Select all
              </Button>
            )}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as CandidateSort)}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CANDIDATE_SORT_LABELS) as CandidateSort[]).map((s) => (
                <SelectItem key={s} value={s}>{CANDIDATE_SORT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-0.5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {candidates.length === 0
                ? "All registrants have been assigned"
                : "No one matches these filters"}
            </p>
          ) : (
            shown.map((c) => (
              <CandidateRow
                key={c.registrantId}
                candidate={c}
                checked={selected.has(c.registrantId)}
                disabled={!selected.has(c.registrantId) && selected.size >= remaining}
                onToggle={() => toggle(c.registrantId)}
              />
            ))
          )}

          {hiddenNoProfile.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline decoration-dashed underline-offset-2"
                onClick={() => setShowNoProfile((v) => !v)}
              >
                {hiddenNoProfile.length} hidden — no profile info
                {showNoProfile ? " (hide)" : " (show)"}
              </button>
              {showNoProfile && (
                <div className="mt-1 space-y-0.5">
                  {hiddenNoProfile.map((c) => (
                    <CandidateRow
                      key={c.registrantId}
                      candidate={c}
                      checked={selected.has(c.registrantId)}
                      disabled={!selected.has(c.registrantId) && selected.size >= remaining}
                      onToggle={() => toggle(c.registrantId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-2 border-t">
        <span className="text-muted-foreground text-sm tabular-nums">
          {selected.size} selected
          {overCapacity && <span className="text-destructive"> · over capacity</span>}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={adding || selected.size === 0 || overCapacity}>
            {adding ? "Adding…" : `Add ${selected.size || ""}`.trim()}
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}

function CandidateRow({
  candidate,
  checked,
  disabled,
  onToggle,
}: {
  candidate: BreakoutCandidate
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  // A high score built entirely on unknowns must not read "Strong", so the
  // band is told whether anything was actually measured.
  const band = scoreBand(candidate.score, candidate.confidence > 0)

  const id = `candidate-${candidate.registrantId}`

  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-3 rounded px-2 py-2 ${
        disabled ? "opacity-50" : "hover:bg-muted/50 cursor-pointer"
      }`}
    >
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">{candidate.name}</span>
        <Badge variant="outline" className="shrink-0 text-xs">
          {candidate.isMember ? "Member" : "Guest"}
        </Badge>
        {/* Visible without applying the filter — someone serving is easy to seat
            by mistake. */}
        {candidate.isVolunteer && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            Volunteer
          </Badge>
        )}
      </div>
      {candidate.passesGates ? (
        <Badge variant="outline" className={`shrink-0 text-xs ${band.className}`}>
          {candidate.confidence > 0 && (
            <span className="tabular-nums">{Math.round(candidate.score * 100)}% </span>
          )}
          {band.label}
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="text-muted-foreground border-muted-foreground/30 shrink-0 gap-1 text-xs"
        >
          <IconAlertTriangle className="size-3" />
          Doesn&apos;t meet criteria
        </Badge>
      )}
    </label>
  )
}
