"use client"

/**
 * Pieces shared by the two halves of the /me portal.
 *
 * The portal asks the same question twice — a guest is asked who their leader is
 * before they are promoted, and a member is asked again whenever they change
 * DGroup — so the leader → group two-step, the satellite list, and the small
 * formatting helpers live here rather than being copied into both screens.
 */

import * as React from "react"
import { IconClock, IconDeviceLaptop, IconUsers } from "@tabler/icons-react"
import { Label } from "@/components/ui/label"
import {
  PersonCombobox,
  type PersonComboboxOption,
} from "@/components/ui/person-combobox"
import { CouplesBadge } from "@/components/group-type-badge"
import { EXTERNAL_SATELLITES_BY_REGION } from "@/lib/constants/ccf-satellites"
import { formatSchedule } from "@/lib/format/schedule"

export const MEETING_FORMAT_LABELS: Record<string, string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In Person",
}

/** Where a person's own DGroup sits — here at Eastwood, or another CCF satellite. */
export type UpwardScope = "eastwood" | "satellite"

export const SATELLITE_OPTIONS = EXTERNAL_SATELLITES_BY_REGION.flatMap(
  ({ region, satellites }) =>
    satellites.map((name) => ({ value: name, label: name, hint: region }))
)

/**
 * Groups may declare only the day they meet, so a null day means "no schedule
 * to show" rather than an empty string the caller has to test for.
 */
export function formatGroupSchedule(
  day: number | null,
  start: string | null,
  end: string | null
): string | null {
  if (day === null) return null
  return formatSchedule(day, start, end) || null
}

export function modeLabel(format: string | null): string | null {
  if (!format) return null
  return MEETING_FORMAT_LABELS[format] ?? format
}

export type GroupOption = {
  id: string
  name: string
  groupType: string
  meetingFormat: "Online" | "Hybrid" | "InPerson" | string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
}

export type LeaderOption = {
  id: string
  name: string
  groups: GroupOption[]
}

/** Compact one-line summary for the group dropdown rows. Group type is shown
 *  separately as a badge (Couples), so it's left out of this line. */
export function groupSummaryLine(g: GroupOption): string {
  return [
    formatGroupSchedule(g.scheduleDayOfWeek, g.scheduleTimeStart, g.scheduleTimeEnd),
    modeLabel(g.meetingFormat),
  ]
    .filter(Boolean)
    .join(" · ")
}

export function GroupDetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-right">{value || "—"}</dd>
    </div>
  )
}

/**
 * "Who is your leader?" then "which of their groups?". Asked in that order
 * because people know their leader's name, not the group's — and it collapses
 * the second step automatically when a leader runs exactly one group.
 *
 * Both steps are `PersonCombobox` — the same searchable picker the satellite
 * list and the admin forms use. Search is the point (Eastwood has more leaders
 * than anyone scrolls through), but it also fixes the DGroup step outright: it
 * used to be a Radix `Select` whose trigger carried custom content instead of a
 * `Select.Value`, and `position="item-aligned"` silently gives up — never placing
 * the list, never focusing it — when there is no value node *or* no selected
 * item. A leader with one group auto-selects, so the broken path only ever
 * showed for leaders running two or more.
 */
export function LeaderGroupPicker({
  leaderOptions,
  selectedLeaderId,
  onLeaderChange,
  selectedGroupId,
  onGroupChange,
}: {
  leaderOptions: LeaderOption[]
  selectedLeaderId: string
  onLeaderChange: (leaderId: string) => void
  selectedGroupId: string
  onGroupChange: (groupId: string) => void
}) {
  const leaderFieldId = React.useId()
  const groupFieldId = React.useId()

  const selectedLeader = leaderOptions.find((l) => l.id === selectedLeaderId)
  const selectedGroup =
    selectedLeader?.groups.find((g) => g.id === selectedGroupId) ?? null

  function handleLeader(leaderId: string) {
    onLeaderChange(leaderId)
    const leader = leaderOptions.find((l) => l.id === leaderId)
    onGroupChange(leader && leader.groups.length === 1 ? leader.groups[0].id : "")
  }

  const leaderChoices: PersonComboboxOption[] = leaderOptions.map((l) => ({
    value: l.id,
    label: l.name,
    hint: l.groups.length > 1 ? `${l.groups.length} groups` : undefined,
  }))

  // The row keeps the group's name as its searchable label and hangs the
  // schedule/mode summary — plus the Couples tag — off the side.
  const groupChoices: PersonComboboxOption[] = (selectedLeader?.groups ?? []).map(
    (g) => {
      const summary = groupSummaryLine(g)
      return {
        value: g.id,
        label: g.name,
        hint: (
          <span className="flex items-center gap-1.5">
            {summary}
            {g.groupType === "Couples" && <CouplesBadge />}
          </span>
        ),
      }
    }
  )

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={leaderFieldId}>1. Group leader</Label>
        <PersonCombobox
          id={leaderFieldId}
          options={leaderChoices}
          value={selectedLeaderId}
          onValueChange={handleLeader}
          placeholder="Select a leader"
          searchPlaceholder="Search leaders…"
          emptyText="No leader found."
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={groupFieldId}
          className={selectedLeader ? "" : "text-muted-foreground"}
        >
          2. DGroup
        </Label>
        <PersonCombobox
          id={groupFieldId}
          options={groupChoices}
          value={selectedGroupId}
          onValueChange={onGroupChange}
          disabled={!selectedLeader}
          placeholder={selectedLeader ? "Select a group" : "Choose a leader first"}
          searchPlaceholder="Search groups…"
          emptyText="No group found."
        />

        {/* Details of the chosen group — stays visible after the dropdown closes
            so the person can confirm before submitting. */}
        {selectedGroup && (
          <dl className="mt-1 space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <GroupDetailRow
              icon={<IconUsers className="size-3.5" />}
              label="Type"
              value={
                selectedGroup.groupType === "Couples" ? <CouplesBadge /> : "Regular"
              }
            />
            <GroupDetailRow
              icon={<IconClock className="size-3.5" />}
              label="Schedule"
              value={formatGroupSchedule(
                selectedGroup.scheduleDayOfWeek,
                selectedGroup.scheduleTimeStart,
                selectedGroup.scheduleTimeEnd
              )}
            />
            <GroupDetailRow
              icon={<IconDeviceLaptop className="size-3.5" />}
              label="Mode"
              value={modeLabel(selectedGroup.meetingFormat)}
            />
          </dl>
        )}
      </div>
    </>
  )
}
