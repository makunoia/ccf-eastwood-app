"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"
import type {
  BreakoutCandidate,
  BreakoutNoticeKind,
  BreakoutPickerOption,
} from "@/lib/breakout-suggestion"
import { cn } from "@/lib/utils"

/**
 * The suggested-table card plus the dropdown of the other tables that fit.
 *
 * Extracted from the registration form, which is the only place it existed and
 * where it was ~130 lines of inline JSX. The check-in kiosks offer the same step
 * over the same ranked data, and a second copy would mean a second version of the
 * occupancy rules, the "no groups match" callout and the notice card — the three
 * details that are easy to get subtly wrong and impossible to notice.
 *
 * **It ranks nothing.** `suggested` and `options` arrive already ordered, from
 * `suggestBreakoutGroup` and `breakoutPickerOptions`. That is deliberate: the
 * registration form re-ranks on every keystroke because the person is *answering*
 * gender and life stage as they go, while the check-in kiosk resolves both once,
 * server-side, from a profile that already exists. A component that did its own
 * matching would have to be handed a profile neither caller shapes the same way.
 *
 * Occupancy is likewise not decided here: a candidate carries counts or it
 * doesn't, and the surface that loaded it made that call (`withoutOccupancy`).
 * Their presence — never a `staff` flag — is what lets a full group be chosen.
 */

const BREAKOUT_NOTICE_COPY: Record<BreakoutNoticeKind, { title: string }> = {
  "awaiting-facilitator": {
    title: "No breakout groups are open yet",
  },
}

const DEFAULT_NOTICE_REASSURANCE =
  "Go ahead and finish registering — a staff member will place you in a group."

export type BreakoutPickerProps = {
  /** The best-fitting group, or null when none is eligible. Pre-ranked. */
  suggested: BreakoutCandidate | null
  /** Every group this person may browse, emptiest first. Pre-ranked and filtered. */
  options: BreakoutPickerOption[]
  /**
   * Whether the surface had any groups at all *before* filtering to this person.
   *
   * Distinct from `options.length`: gender or life stage can rule every group out
   * for one individual on a surface that has plenty, and that is a different thing
   * to say than "there is nothing here".
   */
  hasCandidates: boolean
  /** Why the list is empty, when that's worth explaining. See `resolveBreakoutNotice`. */
  notice: BreakoutNoticeKind | null
  /** Currently chosen group id; `""` for no selection. */
  value: string
  onChange: (groupId: string) => void
  /** Leading line. Each surface says why it's asking in its own words. */
  intro?: string
  /**
   * The "this isn't blocking you" half of the notice. The two surfaces reassure
   * differently — one is mid-registration, the other has already recorded the
   * person's attendance — and it is the only sentence that differs.
   */
  noticeReassurance?: string
}

export function BreakoutPicker({
  suggested,
  options,
  hasCandidates,
  notice,
  value,
  onChange,
  intro = "Pick a group for the event — optional.",
  noticeReassurance = DEFAULT_NOTICE_REASSURANCE,
}: BreakoutPickerProps) {
  const suggestedOccupancy = React.useMemo(
    () => (suggested?.occupancy ? breakoutOccupancy(suggested.occupancy) : null),
    [suggested]
  )

  const selectedOccupancy = React.useMemo(
    () => options.find((g) => g.id === value)?.occupancyView ?? null,
    [options, value]
  )

  return (
    <>
      <p className="text-sm text-muted-foreground">{intro}</p>

      {!hasCandidates && notice && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4">
          <p className="text-sm font-medium">{BREAKOUT_NOTICE_COPY[notice].title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Groups appear here once their facilitator has checked in.{" "}
            {noticeReassurance}
          </p>
        </div>
      )}

      {suggested && (() => {
        const isSelected = value === suggested.id
        return (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Suggested group: ${suggested.name}`}
            onClick={() => onChange(isSelected ? "" : suggested.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors cursor-pointer",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:bg-muted/50"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Suggested for you
              </p>
              <p className="mt-1 text-sm font-medium truncate">{suggested.name}</p>
              {suggestedOccupancy && (
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {suggestedOccupancy.label} members
                  {suggestedOccupancy.remaining !== null &&
                    ` · ${suggestedOccupancy.remaining} left`}
                </p>
              )}
            </div>
            <div
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 bg-background"
              )}
            >
              {isSelected && <IconCheck className="size-3.5" />}
            </div>
          </button>
        )
      })()}

      {/* Gender can rule every group out. Saying so beats an empty
          dropdown, which reads as a broken step. */}
      {hasCandidates && options.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4">
          <p className="text-sm font-medium">No groups match your details</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every breakout group for this event is for a different gender. You can
            continue — the team will place you on the day.
          </p>
        </div>
      )}

      <div className={cn("space-y-2", options.length === 0 && "hidden")}>
        <Label>Or browse groups</Label>
        <Select
          value={value || "_none"}
          onValueChange={(v) => onChange(v === "_none" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">No selection</SelectItem>
            {options.map((g) => (
              // A full group is unselectable on the public form but
              // selectable at the door: a staff member placing someone
              // may have a reason to go over, a self-serve registrant
              // does not.
              <SelectItem key={g.id} value={g.id} disabled={!g.occupancyView && g.isFull}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{g.name}</span>
                  {g.occupancyView ? (
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        g.occupancyView.isFull
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {g.occupancyView.label}
                      {g.occupancyView.isFull && " · full"}
                    </span>
                  ) : (
                    g.isFull && (
                      <span className="shrink-0 text-xs text-muted-foreground">(full)</span>
                    )
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* The warning half of "selectable with a warning". A SelectItem
            can't host this, so it sits under the trigger and speaks to
            whatever is currently chosen. */}
        {selectedOccupancy?.isFull && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">This group is already at capacity</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {selectedOccupancy.label} members. You can still place them here — the group
              will go over its limit.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
