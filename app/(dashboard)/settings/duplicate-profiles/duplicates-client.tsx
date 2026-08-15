"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendarEvent,
  IconCheck,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconClock,
  IconCrown,
  IconHeartHandshake,
  IconHome,
  IconSparkles,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { dominantIndex, isEmptyActivity, type RecordActivity } from "@/lib/people/duplicate-activity"
import {
  resolveDuplicateGroups,
  type BatchMergeItemResult,
  type ResolveDuplicateInput,
} from "./actions"

type DuplicateRecord = {
  id: string
  firstName: string
  lastName: string
  recordType: "member" | "guest"
  activity: RecordActivity
}

type DuplicateField = "phone" | "email" | "name"

type DuplicateGroup = {
  field: DuplicateField
  value: string
  records: DuplicateRecord[]
}

type Props = {
  groups: DuplicateGroup[]
}

const FIELD_LABEL: Record<DuplicateField, string> = {
  phone: "Phone",
  email: "Email",
  name: "Name",
}

type Selection = {
  keeperId: string  // record id selected as keeper for this group
}

function groupKey(g: DuplicateGroup): string {
  return `${g.field}:${g.value}`
}

function isInvalidSelection(g: DuplicateGroup, keeperId: string): string | null {
  const keeper = g.records.find((r) => r.id === keeperId)
  if (!keeper) return null
  // Merging a Member into a Guest is not supported — pick the Member as keeper instead.
  if (
    keeper.recordType === "guest" &&
    g.records.some((r) => r.id !== keeperId && r.recordType === "member")
  ) {
    return "Pick the Member as the keeper to merge with a Guest record."
  }
  return null
}

const MERGE_CHUNK_SIZE = 5

// ─── Activity preview ─────────────────────────────────────────────────────────

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/** "Aug 2026". Month granularity is enough to tell a live record from a dormant one. */
function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", year: "numeric" })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function Stat({
  icon: Icon,
  children,
  title,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  title?: string
  muted?: boolean
}) {
  return (
    <span
      title={title}
      className={["inline-flex items-center gap-1 whitespace-nowrap", muted ? "italic" : ""].join(" ")}
    >
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  )
}

/**
 * One compact line of activity counts for a candidate record.
 *
 * Zero-value metrics are dropped rather than rendered as "0 events" — that is
 * what lets a thin record stay visually quiet next to the live one, so the
 * keeper decision reads off the row without any extra styling.
 */
function ActivityChips({ activity }: { activity: RecordActivity }) {
  const chips: React.ReactNode[] = []

  if (activity.events > 0) {
    chips.push(
      <Stat key="events" icon={IconCalendarEvent} title="Event registrations">
        {plural(activity.events, "event")}
      </Stat>,
    )
  }
  if (activity.checkIns > 0) {
    chips.push(
      <Stat key="checkins" icon={IconCircleCheck} title="Times checked in">
        {plural(activity.checkIns, "check-in")}
      </Stat>,
    )
  }
  if (activity.groupName) {
    chips.push(
      <Stat
        key="group"
        icon={IconUsersGroup}
        muted={activity.groupIsClaimed}
        title={
          activity.groupIsClaimed
            ? "Self-reported DGroup from check-in — not confirmed"
            : "DGroup this profile belongs to"
        }
      >
        {activity.groupIsClaimed ? `Claims ${activity.groupName}` : activity.groupName}
      </Stat>,
    )
  }
  // Tracked separately because `satellite` is deliberately outside the dominance
  // vector — it describes a record rather than measuring its use — so a profile
  // whose only signal is a satellite is still `isEmptyActivity`. See below.
  const showsSatellite = !activity.groupName && !!activity.satellite
  if (showsSatellite) {
    chips.push(
      <Stat key="satellite" icon={IconBuilding} title="DGroup is at another CCF satellite">
        {activity.satellite}
      </Stat>,
    )
  }
  if (activity.ledGroups > 0) {
    chips.push(
      <Stat key="leads" icon={IconCrown} title="DGroups this profile leads">
        Leads {activity.ledGroups}
      </Stat>,
    )
  }
  if (activity.volunteerRoles > 0) {
    chips.push(
      <Stat key="volunteer" icon={IconHeartHandshake} title="Volunteer sign-ups">
        {plural(activity.volunteerRoles, "role")}
      </Stat>,
    )
  }
  if (activity.familyLinks > 0) {
    chips.push(
      <Stat key="family" icon={IconHome} title="Household links">
        {plural(activity.familyLinks, "family link")}
      </Stat>,
    )
  }

  const empty = isEmptyActivity(activity)
  // "No activity" is a claim about the row, not about the vector — printing it
  // beside a satellite chip has the line contradict itself ("No activity · CCF
  // Ortigas"). `empty` still drives the dimming and the date below, because for
  // the keeper decision a satellite genuinely isn't activity; it just isn't
  // *nothing*, which is what this chip asserts.
  if (empty && !showsSatellite) {
    chips.unshift(
      <Stat key="none" icon={IconCircleXFilled} title="Nothing recorded against this profile">
        No activity
      </Stat>,
    )
  }

  // For a dormant record the creation date is the date that matters; for a live
  // one it's the last time anything happened. Show whichever is the real answer.
  chips.push(
    <Stat
      key="when"
      icon={IconClock}
      title={
        `Last activity: ${activity.lastActivityAt ? fullDate(activity.lastActivityAt) : "never"}` +
        ` · Added: ${fullDate(activity.createdAt)}`
      }
    >
      {empty || !activity.lastActivityAt
        ? `Added ${monthYear(activity.createdAt)}`
        : `Active ${monthYear(activity.lastActivityAt)}`}
    </Stat>,
  )

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
        empty ? "text-muted-foreground/70" : "text-muted-foreground",
      ].join(" ")}
    >
      {chips.map((chip, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden className="text-muted-foreground/40">·</span>}
          {chip}
        </React.Fragment>
      ))}
    </div>
  )
}

function ResultsStep({ results, onClose }: { results: MergeResults | null; onClose: () => void }) {
  if (!results) return null
  const { succeeded, failed, totalMerged, failures, successes, fatalError } = results

  const headline =
    fatalError
      ? "Merge stopped early"
      : failed === 0
      ? "Merge complete"
      : succeeded === 0
      ? "All merges failed"
      : "Merge complete with errors"

  return (
    <>
      <DialogHeader>
        <DialogTitle>{headline}</DialogTitle>
        <DialogDescription>
          {fatalError
            ? "The merge was interrupted before all duplicates could be processed."
            : "Review the summary below. Any failures are listed with the reason — you can re-select those duplicates and try again."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Merged</p>
            <p className="text-2xl font-semibold tabular-nums">{succeeded}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Records absorbed</p>
            <p className="text-2xl font-semibold tabular-nums">{totalMerged}</p>
          </div>
          <div className={["rounded-md border p-3", failed > 0 ? "border-destructive/50 bg-destructive/5" : ""].join(" ")}>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className={["text-2xl font-semibold tabular-nums", failed > 0 ? "text-destructive" : ""].join(" ")}>
              {failed}
            </p>
          </div>
        </div>

        {fatalError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {fatalError}
          </div>
        )}

        {failures.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Failed merges</p>
            <div className="divide-y rounded-md border">
              {failures.map((f, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <IconCircleXFilled className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={f.field === "name" ? "text-xs" : "font-mono text-xs"}>{f.value}</span>
                      <span className="text-xs text-muted-foreground">({f.field})</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs">
                        keeper <span className="font-medium">{f.keeperName}</span>
                        <span className="text-muted-foreground"> ({f.keeperType})</span>
                      </span>
                    </div>
                    <p className="text-xs text-destructive">{f.error}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {successes.length > 0 && (
          <details className="rounded-md border" open={failures.length === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none flex items-center gap-2">
              <IconCircleCheckFilled className="size-4 text-emerald-500" />
              {successes.length} successful {successes.length === 1 ? "merge" : "merges"}
            </summary>
            <div className="divide-y border-t max-h-60 overflow-y-auto">
              {successes.map((s, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={s.field === "name" ? "text-xs" : "font-mono text-xs"}>{s.value}</span>
                      <span className="text-xs text-muted-foreground">({s.field})</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs">
                        kept <span className="font-medium">{s.keeperName}</span>
                        <span className="text-muted-foreground"> ({s.keeperType})</span>
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {s.losersCount} record{s.losersCount === 1 ? "" : "s"} absorbed
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  )
}

type FailureRow = {
  field: DuplicateField
  value: string
  keeperName: string
  keeperType: "member" | "guest"
  losersCount: number
  error: string
}

type SuccessRow = {
  field: DuplicateField
  value: string
  keeperName: string
  keeperType: "member" | "guest"
  losersCount: number
}

type MergeResults = {
  total: number
  succeeded: number
  failed: number
  totalMerged: number
  failures: FailureRow[]
  successes: SuccessRow[]
  fatalError: string | null
}

export function DuplicatesClient({ groups }: Props) {
  const router = useRouter()
  const [selections, setSelections] = React.useState<Map<string, Selection>>(new Map())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogStep, setDialogStep] = React.useState<"confirm" | "results">("confirm")
  const [submitting, setSubmitting] = React.useState(false)
  const [progress, setProgress] = React.useState<{ current: number; total: number } | null>(null)
  const [results, setResults] = React.useState<MergeResults | null>(null)

  // Warn the user if they try to close the tab / navigate away during a merge.
  React.useEffect(() => {
    if (!submitting) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [submitting])

  const nameGroupCount = React.useMemo(
    () => groups.filter((g) => g.field === "name").length,
    [groups],
  )
  const contactGroupCount = groups.length - nameGroupCount

  // Tally valid and invalid selections
  const tally = React.useMemo(() => {
    let valid = 0
    let invalid = 0
    const validInputs: { groupKey: string; group: DuplicateGroup; sel: Selection }[] = []
    for (const g of groups) {
      const sel = selections.get(groupKey(g))
      if (!sel) continue
      if (isInvalidSelection(g, sel.keeperId)) {
        invalid++
      } else {
        valid++
        validInputs.push({ groupKey: groupKey(g), group: g, sel })
      }
    }
    return { valid, invalid, validInputs }
  }, [groups, selections])

  function toggleKeeper(g: DuplicateGroup, recordId: string) {
    setSelections((prev) => {
      const next = new Map(prev)
      const key = groupKey(g)
      const cur = next.get(key)
      if (cur?.keeperId === recordId) {
        next.delete(key)
      } else {
        next.set(key, { keeperId: recordId })
      }
      return next
    })
  }

  function selectAllMembersAsKeepers() {
    setSelections((prev) => {
      const next = new Map(prev)
      for (const g of groups) {
        // Name matches are a weak signal — they stay a deliberate, per-group
        // decision and are never swept up by "select all".
        if (g.field === "name") continue
        if (next.has(groupKey(g))) continue
        // Pick the first Member in the group if any (avoids invalid Guest-as-keeper combos)
        const memberPick = g.records.find((r) => r.recordType === "member")
        const pick = memberPick ?? g.records[0]
        if (pick && !isInvalidSelection(g, pick.id)) {
          next.set(groupKey(g), { keeperId: pick.id })
        }
      }
      return next
    })
  }

  function clearAll() {
    setSelections(new Map())
  }

  async function handleConfirm() {
    if (tally.valid === 0) return
    setSubmitting(true)

    // Build the server payload and a parallel display-context array indexed identically.
    type Context = {
      field: DuplicateField
      value: string
      keeperName: string
      keeperType: "member" | "guest"
      losersCount: number
    }
    const payload: ResolveDuplicateInput[] = []
    const contexts: Context[] = []
    for (const { group, sel } of tally.validInputs) {
      const keeper = group.records.find((r) => r.id === sel.keeperId)!
      const losers = group.records
        .filter((r) => r.id !== sel.keeperId)
        .map((r) => ({ id: r.id, type: r.recordType }))
      payload.push({ keeperId: keeper.id, keeperType: keeper.recordType, losers })
      contexts.push({
        field: group.field,
        value: group.value,
        keeperName: `${keeper.firstName} ${keeper.lastName}`,
        keeperType: keeper.recordType,
        losersCount: losers.length,
      })
    }

    const total = payload.length
    setProgress({ current: 0, total })

    let succeeded = 0
    let failed = 0
    let totalMerged = 0
    const items: BatchMergeItemResult[] = []
    let fatalError: string | null = null
    let processed = 0

    // Chunk client-side so a long batch produces real progress instead of one big spinner.
    for (let i = 0; i < payload.length; i += MERGE_CHUNK_SIZE) {
      const chunk = payload.slice(i, i + MERGE_CHUNK_SIZE)
      const result = await resolveDuplicateGroups(chunk)
      if (!result.success) {
        fatalError = result.error
        break
      }
      succeeded += result.data.succeeded
      failed += result.data.failed
      totalMerged += result.data.totalMerged
      items.push(...result.data.items.map((it) => ({ ...it, index: it.index + i })))
      processed += chunk.length
      setProgress({ current: processed, total })
    }

    // Build the results summary by joining each result item back to its context.
    const failures: FailureRow[] = []
    const successes: SuccessRow[] = []
    for (const item of items) {
      const ctx = contexts[item.index]
      if (!ctx) continue
      if (item.success) {
        successes.push({
          field: ctx.field,
          value: ctx.value,
          keeperName: ctx.keeperName,
          keeperType: ctx.keeperType,
          losersCount: ctx.losersCount,
        })
      } else {
        failures.push({
          field: ctx.field,
          value: ctx.value,
          keeperName: ctx.keeperName,
          keeperType: ctx.keeperType,
          losersCount: ctx.losersCount,
          error: item.error,
        })
      }
    }

    setResults({
      total,
      succeeded,
      failed,
      totalMerged,
      failures,
      successes,
      fatalError,
    })
    setSubmitting(false)
    setProgress(null)
    setDialogStep("results")
    router.refresh()
  }

  function handleResultsClose() {
    setDialogOpen(false)
    setDialogStep("confirm")
    setResults(null)
    setSelections(new Map())
  }

  function openConfirm() {
    setDialogStep("confirm")
    setResults(null)
    setDialogOpen(true)
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm font-medium">No duplicates found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No phone number, email address, or full name is shared across Members and Guests.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {groups.length} potential {groups.length === 1 ? "duplicate" : "duplicates"} found
            {nameGroupCount > 0 && (
              <>
                {" "}· {contactGroupCount} by contact, {nameGroupCount} by name
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAllMembersAsKeepers}
              disabled={contactGroupCount === 0}
            >
              Select all contact matches (prefer Member)
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={selections.size === 0}>
              Clear
            </Button>
          </div>
        </div>

        {groups.map((group) => {
          const sel = selections.get(groupKey(group))
          const invalidReason = sel ? isInvalidSelection(group, sel.keeperId) : null
          // null when no record leads on every count — the ambiguous groups get
          // no badge at all rather than a guess.
          const dominantIdx = dominantIndex(group.records.map((r) => r.activity))
          return (
            <div key={groupKey(group)} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                {group.field === "name" ? (
                  <IconUsers className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <IconAlertTriangle className="size-4 text-amber-500 shrink-0" />
                )}
                <span className={["text-sm font-medium", group.field === "name" ? "" : "font-mono"].join(" ")}>
                  {group.value}
                </span>
                <Badge variant="outline" className="text-xs">
                  {FIELD_LABEL[group.field]}
                </Badge>
              </div>
              {group.field === "name" && (
                <p className="text-xs text-muted-foreground">
                  Same name, different contact details — two people can share a name, so open each profile and
                  confirm before merging.
                </p>
              )}
              <div className="divide-y rounded-md border">
                {group.records.map((record, i) => {
                  const isKeeper = sel?.keeperId === record.id
                  const isMostActive = i === dominantIdx
                  return (
                    <div key={record.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={record.recordType === "member" ? `/members/${record.id}` : `/guests/${record.id}`}
                            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors truncate"
                          >
                            {record.firstName} {record.lastName}
                          </Link>
                          <Badge variant="secondary" className="text-xs capitalize shrink-0">
                            {record.recordType}
                          </Badge>
                          {isMostActive && (
                            <Badge
                              variant="outline"
                              className="text-xs shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                              title="Leads every other record here on every count — most likely the live profile"
                            >
                              <IconSparkles className="size-3" />
                              Most activity
                            </Badge>
                          )}
                          {isKeeper && (
                            <Badge variant="default" className="text-xs shrink-0">
                              <IconCheck className="size-3" />
                              Keeper
                            </Badge>
                          )}
                        </div>
                        <ActivityChips activity={record.activity} />
                      </div>
                      <Button
                        variant={isKeeper ? "default" : "outline"}
                        size="sm"
                        className="shrink-0"
                        onClick={() => toggleKeeper(group, record.id)}
                      >
                        {isKeeper ? "Selected" : "Keep this"}
                      </Button>
                    </div>
                  )
                })}
              </div>
              {invalidReason && (
                <p className="text-xs text-destructive">{invalidReason}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Sticky footer */}
      <div
        className={[
          "fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur",
          "transition-transform duration-200 ease-out",
          selections.size === 0 ? "translate-y-full" : "translate-y-0",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">
              {tally.valid} of {groups.length} {groups.length === 1 ? "duplicate" : "duplicates"} ready to merge
            </span>
            {tally.invalid > 0 && (
              <span className="text-destructive">
                · {tally.invalid} invalid selection{tally.invalid === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Cancel
            </Button>
            <Button onClick={openConfirm} disabled={tally.valid === 0}>
              Merge {tally.valid} {tally.valid === 1 ? "duplicate" : "duplicates"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          // Lock dialog while merging — close button + ESC + outside-click all gated by `submitting`.
          if (submitting) return
          if (!v && dialogStep === "results") {
            handleResultsClose()
            return
          }
          setDialogOpen(v)
        }}
      >
        <DialogContent
          className={dialogStep === "results" ? "sm:max-w-2xl" : undefined}
          showCloseButton={!submitting}
          onPointerDownOutside={(e) => { if (submitting) e.preventDefault() }}
          onEscapeKeyDown={(e) => { if (submitting) e.preventDefault() }}
          onInteractOutside={(e) => { if (submitting) e.preventDefault() }}
        >
          {dialogStep === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {submitting
                    ? `Merging ${tally.valid} ${tally.valid === 1 ? "duplicate" : "duplicates"}…`
                    : `Merge ${tally.valid} ${tally.valid === 1 ? "duplicate" : "duplicates"}?`}
                </DialogTitle>
                {!submitting && (
                  <DialogDescription>
                    For each selected duplicate, the records you didn&apos;t mark as keeper will be merged into
                    the keeper. Their event registrations, group memberships, and history will be transferred.
                    This cannot be undone.
                    {tally.invalid > 0 && (
                      <>
                        {" "}{tally.invalid} {tally.invalid === 1 ? "duplicate" : "duplicates"} with invalid selections will be skipped.
                      </>
                    )}
                  </DialogDescription>
                )}
              </DialogHeader>

              {submitting && progress && (
                <div className="flex flex-col gap-2 py-1">
                  <div className="h-1.5 relative overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Merged {progress.current} of {progress.total} {progress.total === 1 ? "duplicate" : "duplicates"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-500">
                    Please don&apos;t close this page until merging finishes.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleConfirm} disabled={submitting}>
                  {submitting ? "Merging…" : `Merge ${tally.valid} ${tally.valid === 1 ? "duplicate" : "duplicates"}`}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <ResultsStep results={results} onClose={handleResultsClose} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
