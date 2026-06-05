"use client"

import * as React from "react"
import { IconUserSearch, IconUserPlus, IconUserOff, IconAlertTriangle, IconCheck } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PersonCombobox, type PersonComboboxOption } from "@/components/ui/person-combobox"
import type { UnmatchedLeaderRow, LeaderResolution } from "@/lib/import/types"

type MemberOption = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

type Props = {
  rows: UnmatchedLeaderRow[]
  resolutions: Map<number, LeaderResolution>
  members: MemberOption[]
  membersLoading: boolean
  // Called with ALL rowIndexes in the group so one decision covers every occurrence
  onResolutionChange: (rowIndexes: number[], resolution: LeaderResolution) => void
}

type RowMode = "link" | "create" | "none"

// Groups rows that share the same leader identity (mobile > email > name).
// Rows with absolutely no identity data are intentionally kept separate.
type LeaderGroup = {
  key: string
  representative: UnmatchedLeaderRow
  rowIndexes: number[]
  groupNames: string[]
}

function leaderIdentityKey(row: UnmatchedLeaderRow): string {
  const mobile = row.leaderMobile.trim()
  const email  = row.leaderEmail.trim()
  if (mobile) return `m:${mobile}`
  if (email)  return `e:${email.toLowerCase()}`
  const name = `${row.leaderFirstName.trim()} ${row.leaderLastName.trim()}`.trim().toLowerCase()
  if (!name) return `row:${row.rowIndex}`
  return `n:${name}`
}

function buildGroups(rows: UnmatchedLeaderRow[]): LeaderGroup[] {
  const map = new Map<string, LeaderGroup>()
  for (const row of rows) {
    const key = leaderIdentityKey(row)
    if (!map.has(key)) {
      map.set(key, { key, representative: row, rowIndexes: [], groupNames: [] })
    }
    const g = map.get(key)!
    g.rowIndexes.push(row.rowIndex)
    if (row.groupName) g.groupNames.push(row.groupName)
  }
  return Array.from(map.values())
}

function LeaderGroupCard({
  group,
  resolution,
  members,
  membersLoading,
  onResolutionChange,
}: {
  group: LeaderGroup
  resolution: LeaderResolution | undefined
  members: MemberOption[]
  membersLoading: boolean
  onResolutionChange: (resolution: LeaderResolution) => void
}) {
  const { representative: row, rowIndexes, groupNames } = group
  const cardKey  = rowIndexes[0]
  const hasNoData = !row.leaderFirstName && !row.leaderLastName && !row.leaderMobile && !row.leaderEmail
  const isResolved = !!resolution

  const [mode, setMode] = React.useState<RowMode>(resolution?.type ?? "link")
  const [selectedMemberId, setSelectedMemberId] = React.useState<string>(
    resolution?.type === "link" ? resolution.memberId : ""
  )

  // Sync local state when resolution is changed externally (e.g. bulk "Set all")
  React.useEffect(() => {
    if (!resolution) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(resolution.type)
    setSelectedMemberId(resolution.type === "link" ? resolution.memberId : "")
  }, [resolution])

  const memberOptions: PersonComboboxOption[] = members.map((m) => ({
    value: m.id,
    label: `${m.firstName} ${m.lastName}`,
    hint: m.phone ?? m.email ?? undefined,
  }))

  const hasName = row.leaderFirstName || row.leaderLastName

  function handleModeChange(next: RowMode) {
    setMode(next)
    if (next === "create") {
      onResolutionChange({
        type:      "create",
        firstName: row.leaderFirstName,
        lastName:  row.leaderLastName,
        email:     row.leaderEmail  || undefined,
        mobile:    row.leaderMobile || undefined,
      })
    } else if (next === "none") {
      setSelectedMemberId("")
      onResolutionChange({ type: "none" })
    } else {
      setSelectedMemberId("")
    }
  }

  function handleMemberSelect(memberId: string) {
    setSelectedMemberId(memberId)
    if (!memberId) return
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    onResolutionChange({
      type:       "link",
      memberId:   member.id,
      memberName: `${member.firstName} ${member.lastName}`,
    })
  }

  return (
    <div className={[
      "rounded-lg border p-4 flex flex-col gap-3 transition-colors",
      isResolved ? "border-green-300 bg-green-50/40" : "bg-card",
      hasNoData && !isResolved ? "border-destructive/40" : "",
    ].join(" ")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {/* Leader identity */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {hasName && (
              <span className="text-foreground font-medium text-sm">
                {[row.leaderFirstName, row.leaderLastName].filter(Boolean).join(" ")}
              </span>
            )}
            {row.leaderMobile && <span>{row.leaderMobile}</span>}
            {row.leaderEmail  && <span>{row.leaderEmail}</span>}
            {hasNoData && (
              <span className="italic text-sm text-muted-foreground">No leader data in CSV</span>
            )}
          </div>
          {/* Resolution summary when resolved */}
          {isResolved && (
            <p className="text-xs text-green-700 font-medium mt-0.5 flex items-center gap-1">
              <IconCheck className="size-3" />
              {resolution.type === "link"
                ? `Linked to ${resolution.memberName}`
                : resolution.type === "create"
                  ? "Will create new Member"
                  : "Will import without a leader"}
            </p>
          )}
          {/* Affected groups */}
          <div className="flex flex-wrap gap-1 mt-1">
            {groupNames.map((name) => (
              <span key={name} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                {name}
              </span>
            ))}
            {rowIndexes.length > groupNames.length && (
              <span className="text-xs text-muted-foreground italic">
                +{rowIndexes.length - groupNames.length} more
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {rowIndexes.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              {rowIndexes.length} groups
            </Badge>
          )}
          {isResolved ? (
            <Badge variant="outline" className="text-green-700 border-green-400 bg-green-50 text-xs">
              {resolution.type === "link" ? "Linked" : resolution.type === "create" ? "Will create" : "No leader"}
            </Badge>
          ) : hasNoData ? (
            <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/5 text-xs">
              No data
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-700 border-orange-400 bg-orange-50 text-xs">
              Unmatched
            </Badge>
          )}
        </div>
      </div>

      {/* Resolution options */}
      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name={`leader-mode-${cardKey}`}
            value="link"
            checked={mode === "link"}
            onChange={() => handleModeChange("link")}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1 flex flex-col gap-1.5">
            <span className="text-sm flex items-center gap-1.5">
              <IconUserSearch className="size-3.5 text-muted-foreground" />
              Search and link existing member
            </span>
            {mode === "link" && (
              <PersonCombobox
                options={memberOptions}
                value={selectedMemberId}
                onValueChange={handleMemberSelect}
                placeholder={membersLoading ? "Loading members…" : "Select member…"}
                searchPlaceholder="Search by name or phone…"
                disabled={membersLoading}
              />
            )}
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name={`leader-mode-${cardKey}`}
            value="create"
            checked={mode === "create"}
            onChange={() => handleModeChange("create")}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1 flex flex-col gap-1.5">
            <span className="text-sm flex items-center gap-1.5">
              <IconUserPlus className="size-3.5 text-muted-foreground" />
              Create new Member
              {rowIndexes.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  — one record, shared across all {rowIndexes.length} groups
                </span>
              )}
            </span>
            {mode === "create" && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                {hasName && (
                  <span>
                    Name:{" "}
                    <span className="text-foreground font-medium">
                      {[row.leaderFirstName, row.leaderLastName].filter(Boolean).join(" ")}
                    </span>
                  </span>
                )}
                {row.leaderMobile && (
                  <span>Mobile: <span className="text-foreground font-medium">{row.leaderMobile}</span></span>
                )}
                {row.leaderEmail && (
                  <span>Email: <span className="text-foreground font-medium">{row.leaderEmail}</span></span>
                )}
                {!hasName && !row.leaderMobile && !row.leaderEmail && (
                  <span className="italic">No data to pre-fill — member will have empty fields</span>
                )}
              </div>
            )}
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name={`leader-mode-${cardKey}`}
            value="none"
            checked={mode === "none"}
            onChange={() => handleModeChange("none")}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1 flex flex-col gap-1.5">
            <span className="text-sm flex items-center gap-1.5">
              <IconUserOff className="size-3.5 text-muted-foreground" />
              Import without a leader
              <span className="text-xs text-muted-foreground">
                — assign a leader later
              </span>
            </span>
          </div>
        </label>
      </div>
    </div>
  )
}

export function StepLeaderResolution({ rows, resolutions, members, membersLoading, onResolutionChange }: Props) {
  const groups = React.useMemo(() => buildGroups(rows), [rows])
  const unresolvedCount = groups.filter((g) => !resolutions.has(g.rowIndexes[0])).length

  const unresolvedGroups = groups.filter((g) => !resolutions.has(g.rowIndexes[0]))

  function handleSetRemainingCreate() {
    for (const group of unresolvedGroups) {
      const row = group.representative
      onResolutionChange(group.rowIndexes, {
        type:      "create",
        firstName: row.leaderFirstName,
        lastName:  row.leaderLastName,
        email:     row.leaderEmail  || undefined,
        mobile:    row.leaderMobile || undefined,
      })
    }
  }

  function handleSetRemainingNone() {
    for (const group of unresolvedGroups) {
      onResolutionChange(group.rowIndexes, { type: "none" })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Banner */}
      <div className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm">
        <IconAlertTriangle className="size-4 text-orange-600 shrink-0" />
        <span className="text-orange-800 flex-1">
          <span className="font-medium">{groups.length} leader{groups.length !== 1 ? "s" : ""}</span>
          {" "}could not be automatically matched.
          {unresolvedCount > 0 && (
            <span className="ml-1 font-medium">({unresolvedCount} remaining)</span>
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0"
          onClick={handleSetRemainingCreate}
          disabled={unresolvedGroups.length === 0}
        >
          Create remaining{unresolvedGroups.length > 0 ? ` (${unresolvedGroups.length})` : ""} as new Members
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs shrink-0"
          onClick={handleSetRemainingNone}
          disabled={unresolvedGroups.length === 0}
        >
          Import remaining without leader
        </Button>
      </div>

      {/* Group list */}
      <div className="flex flex-col gap-3 max-h-[min(420px,45vh)] overflow-y-auto pr-0.5">
        {groups.map((group) => (
          <LeaderGroupCard
            key={group.key}
            group={group}
            resolution={resolutions.get(group.rowIndexes[0])}
            members={members}
            membersLoading={membersLoading}
            onResolutionChange={(res) => onResolutionChange(group.rowIndexes, res)}
          />
        ))}
      </div>
    </div>
  )
}
