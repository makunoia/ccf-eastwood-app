"use client"

import * as React from "react"
import Link from "next/link"
import { IconCalendarEvent } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  setWalkInLatestSession,
  setWalkInOccurrence,
} from "@/app/(dashboard)/events/form-config-actions"

/**
 * Which session the walk-in form registers people into (CCF-133).
 *
 * The occurrence used to come from the URL, so the door could target a session
 * nobody chose. It is now an explicit setting, and it doubles as a second gate:
 * no session selected — or a selected session that is closed — means the walk-in
 * form is off, whatever its Public access switch says.
 *
 * Opening a session's check-in on Sessions writes this field too, so the common
 * path never comes through here. What's left for this control is the uncommon
 * one: aiming the door at a session other than the one just opened — or handing
 * the choice over standingly with "Latest", which follows whichever session is
 * newest so a weekly event never needs re-pointing. "Latest" still obeys the
 * closed-session gate; it changes which session is read, not whether it's open.
 *
 * Only rendered for MultiDay/Recurring events. OneTime events have no occurrences
 * at all; a walk-in there stamps `attendedAt` on the registrant.
 */

export type WalkInSessionOption = {
  id: string
  /** Pre-formatted on the server so the option list can't drift from Sessions. */
  label: string
  isOpen: boolean
}

/** What the event is set to, as stored. */
export type WalkInSessionSelection =
  | { mode: "Latest" }
  | { mode: "Pinned"; occurrenceId: string | null }

/** Sentinels — Radix Select treats "" as a cleared value, so both need a token. */
const NONE = "__none__"
const LATEST = "__latest__"

export function WalkInSessionSetting({
  eventId,
  sessionsHref,
  occurrences,
  initial,
  latest,
  sessionNoun,
}: {
  eventId: string
  sessionsHref: string
  occurrences: WalkInSessionOption[]
  initial: WalkInSessionSelection
  /**
   * The session "Latest" resolves to right now, resolved server-side by the same
   * helper the public door uses. Null when the event has no sessions yet.
   */
  latest: WalkInSessionOption | null
  /** "session" for Recurring, "day" for MultiDay — mirrors the Sessions page. */
  sessionNoun: string
}) {
  const [selection, setSelection] = React.useState<WalkInSessionSelection>(initial)
  const [saving, setSaving] = React.useState(false)

  const followsLatest = selection.mode === "Latest"
  // In Latest mode the effective session is whatever is newest, so the status copy
  // below reads one resolved session either way rather than branching twice.
  const current = followsLatest
    ? latest
    : (occurrences.find((o) => o.id === selection.occurrenceId) ?? null)
  const isLive = current !== null && current.isOpen

  const value = followsLatest ? LATEST : (selection.occurrenceId ?? NONE)

  async function handleChange(next: string) {
    const previous = selection
    const chosen: WalkInSessionSelection =
      next === LATEST
        ? { mode: "Latest" }
        : { mode: "Pinned", occurrenceId: next === NONE ? null : next }
    setSelection(chosen)
    setSaving(true)
    const result =
      chosen.mode === "Latest"
        ? await setWalkInLatestSession(eventId)
        : await setWalkInOccurrence(eventId, chosen.occurrenceId)
    setSaving(false)
    if (!result.success) {
      setSelection(previous)
      toast.error(result.error)
      return
    }
    toast.success(
      chosen.mode === "Latest"
        ? `Walk-in follows the latest ${sessionNoun}`
        : chosen.occurrenceId
          ? "Walk-in session updated"
          : "Walk-in session cleared"
    )
  }

  // Nothing to pick yet. Recurring events only grow occurrences when a check-in
  // page is opened, so this is the normal state for a freshly created one. Latest
  // mode survives it — it just has nothing to resolve to until the first session
  // exists — so the card says which of the two states it's in.
  if (occurrences.length === 0) {
    return (
      <SettingCard
        className="max-w-2xl"
        icon={IconCalendarEvent}
        title={`Walk-in ${sessionNoun}`}
        description={
          followsLatest
            ? `Walk-in follows the latest ${sessionNoun}, but this event has no ${sessionNoun}s yet — it stays off until the first one is created and open.`
            : `This event has no ${sessionNoun}s yet. Walk-in stays off until there's one to register people into.`
        }
      >
        <Link
          href={sessionsHref}
          className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
        >
          Go to Sessions
        </Link>
      </SettingCard>
    )
  }

  return (
    <SettingCard
      className="max-w-2xl"
      icon={IconCalendarEvent}
      title={`Walk-in ${sessionNoun}`}
      description={`Which ${sessionNoun} someone registering at the door is checked into. Opening a ${sessionNoun}'s check-in on Sessions sets this automatically — or pick "Latest ${sessionNoun}" to always use the newest one, so it never needs re-pointing.`}
      control={
        <Select value={value} onValueChange={handleChange} disabled={saving}>
          <SelectTrigger className="w-[15rem]" aria-label={`Walk-in ${sessionNoun}`}>
            <SelectValue placeholder={`Pick a ${sessionNoun}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None — walk-in off</SelectItem>
            {/* Above the list, because it is a rule rather than one of the rows —
                picking it means "whatever the newest row turns out to be". */}
            <SelectItem value={LATEST}>Latest {sessionNoun} created</SelectItem>
            <SelectSeparator />
            {occurrences.map((occurrence) => (
              <SelectItem key={occurrence.id} value={occurrence.id}>
                {occurrence.label}
                {occurrence.isOpen ? "" : " · closed"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {/* This control silently gates a door surface, so it has to say its own
          state rather than leaving staff to infer it from the dropdown. Latest
          mode names the session it currently resolves to for the same reason: a
          rule that doesn't show its answer is not a readable setting. */}
      <p className="text-sm text-muted-foreground">
        {isLive ? (
          <>
            Walk-in registers into <span className="font-medium">{current.label}</span>
            {followsLatest ? (
              <>, and will follow the next {sessionNoun} you create.</>
            ) : (
              <>.</>
            )}
          </>
        ) : current ? (
          <>
            <span className="font-medium">{current.label}</span>
            {followsLatest ? ` is the latest ${sessionNoun} and it's closed` : " is closed"}, so
            walk-in is off. Open it from{" "}
            <Link
              href={sessionsHref}
              className="underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
            >
              Sessions
            </Link>
            .
          </>
        ) : (
          <>Walk-in is off — no {sessionNoun} selected.</>
        )}
      </p>
    </SettingCard>
  )
}
