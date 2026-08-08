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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setWalkInOccurrence } from "@/app/(dashboard)/events/form-config-actions"

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
 * one: aiming the door at a session other than the one just opened.
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

/** Sentinel for "no session" — Radix Select treats "" as a cleared value. */
const NONE = "__none__"

export function WalkInSessionSetting({
  eventId,
  sessionsHref,
  occurrences,
  initial,
  sessionNoun,
}: {
  eventId: string
  sessionsHref: string
  occurrences: WalkInSessionOption[]
  initial: string | null
  /** "session" for Recurring, "day" for MultiDay — mirrors the Sessions page. */
  sessionNoun: string
}) {
  const [selected, setSelected] = React.useState<string | null>(initial)
  const [saving, setSaving] = React.useState(false)

  const current = occurrences.find((o) => o.id === selected) ?? null
  const isLive = current !== null && current.isOpen

  async function handleChange(value: string) {
    const next = value === NONE ? null : value
    const previous = selected
    setSelected(next)
    setSaving(true)
    const result = await setWalkInOccurrence(eventId, next)
    setSaving(false)
    if (!result.success) {
      setSelected(previous)
      toast.error(result.error)
      return
    }
    toast.success(next ? "Walk-in session updated" : "Walk-in session cleared")
  }

  // Nothing to pick yet. Recurring events only grow occurrences when a check-in
  // page is opened, so this is the normal state for a freshly created one.
  if (occurrences.length === 0) {
    return (
      <SettingCard
        className="max-w-2xl"
        icon={IconCalendarEvent}
        title={`Walk-in ${sessionNoun}`}
        description={`This event has no ${sessionNoun}s yet. Walk-in stays off until there's one to register people into.`}
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
      description={`Which ${sessionNoun} someone registering at the door is checked into. Opening a ${sessionNoun}'s check-in on Sessions sets this automatically — change it here only to aim the door somewhere else.`}
      control={
        <Select
          value={selected ?? NONE}
          onValueChange={handleChange}
          disabled={saving}
        >
          <SelectTrigger className="w-[15rem]" aria-label={`Walk-in ${sessionNoun}`}>
            <SelectValue placeholder={`Pick a ${sessionNoun}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None — walk-in off</SelectItem>
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
          state rather than leaving staff to infer it from the dropdown. */}
      <p className="text-sm text-muted-foreground">
        {isLive ? (
          <>
            Walk-in registers into <span className="font-medium">{current.label}</span>.
          </>
        ) : current ? (
          <>
            <span className="font-medium">{current.label}</span> is closed, so walk-in is
            off. Open it from{" "}
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
