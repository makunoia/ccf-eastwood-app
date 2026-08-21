"use client"

import { useState, useRef, useMemo } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  ChevronDown,
  XCircle,
  ArrowLeftRight,
  SearchIcon,
  UserCheck,
  UserPlus,
  Users,
  XIcon,
} from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/session-stat-card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  buildSessionAttendeeStats,
  isAttendeeStatusEditable,
  resolveStatusSelection,
  sortSessionAttendees,
  sortBreakoutStats,
  type AttendeeSortDirection,
  type AttendeeStatusChoice,
  type BreakoutStatSortMode,
} from "@/lib/session-attendees"
import type { BreakoutOccupancy } from "@/lib/breakouts/occupancy"
import { cn } from "@/lib/utils"
import type { PersonComboboxOption } from "@/components/ui/person-combobox"
import {
  assignSubFacilitator,
  removeSubFacilitator,
} from "./sub-facilitator-actions"
import { removeSessionAttendee, setAttendeeReturnerStatus } from "./attendee-actions"
// Mirrors the Prisma enum — avoid importing Prisma client in client components (pulls node:module)
const FacilitatorRole = { Facilitator: "Facilitator", CoFacilitator: "CoFacilitator" } as const
type FacilitatorRole = (typeof FacilitatorRole)[keyof typeof FacilitatorRole]

export type AttendeeRow = {
  id: string
  kind: "registrant" | "volunteer"
  subjectId: string
  name: string | null
  checkedInAtFormatted: string
  isReturner: boolean
  /** The status before any admin override — lets a toggle back clear the override. */
  derivedIsReturner: boolean
  /** Whether an admin has pinned this row's status. */
  hasStatusOverride: boolean
  isMember: boolean
  isVolunteer: boolean
  breakoutGroupIds: string[]
  breakoutGroupNames: string[]
  gender: "Male" | "Female" | null
}

function StatusBadge({
  attendee,
  editable,
  onSelect,
}: {
  attendee: AttendeeRow
  editable: boolean
  onSelect: (choice: AttendeeStatusChoice) => Promise<void>
}) {
  // Plain state rather than useTransition: an async transition stays pending until
  // everything it schedules settles, including the background router.refresh() — which
  // would re-disable the badge for the whole round trip we are trying to hide.
  const [pending, setPending] = useState(false)

  // `attendee.isReturner` is already the optimistic value, so the badge has flipped
  // by the time this renders — no spinner, and deliberately no dimming while the
  // write lands. `pending` only guards against a second click racing the first.
  const badge = attendee.isReturner ? (
    <Badge variant="secondary">Returning</Badge>
  ) : (
    <Badge>New</Badge>
  )

  if (!editable) return badge

  const current: AttendeeStatusChoice = attendee.isReturner ? "returning" : "new"

  async function handleValueChange(value: string) {
    setPending(true)
    try {
      await onSelect(value as AttendeeStatusChoice)
    } finally {
      setPending(false)
    }
  }

  // A menu rather than a one-click toggle: it names both destinations up front, so
  // correcting a misclick never depends on a hover-only tooltip — which never fires on
  // the tablets these sessions are actually run from.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Status: ${attendee.isReturner ? "Returning" : "New"}. Change status.`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-70 disabled:cursor-default",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            // A badge-sized hit area is a miss on the tablets these sessions run
            // from. Pad the target out and pull the same amount back off the
            // margin, so the tap area grows without moving the badge.
            "-m-2 p-2 xl:m-0 xl:p-0",
          )}
        >
          {badge}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={handleValueChange}>
          <DropdownMenuRadioItem value="returning">Returning</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="new">New</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RemoveAttendeeButton({ onSelect }: { onSelect: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onSelect}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Remove from session</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Remove from session</TooltipContent>
    </Tooltip>
  )
}

/** Member / Guest / Volunteer — one badge, same three cases in the card and the table. */
function TypeBadge({ attendee }: { attendee: AttendeeRow }) {
  if (attendee.isVolunteer) {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600">
        Volunteer
      </Badge>
    )
  }
  if (attendee.isMember) return <Badge variant="secondary">Member</Badge>
  return <Badge variant="outline">Guest</Badge>
}

// Volunteers link to the volunteer detail page; registrants to the registrant detail page.
function attendeeHref(eventId: string, a: AttendeeRow): string {
  return a.kind === "volunteer"
    ? `/event/${eventId}/volunteers/${a.subjectId}`
    : `/event/${eventId}/registrants/${a.subjectId}`
}

export type BreakoutGroupOption = {
  id: string
  name: string
}

export type BreakoutStatRow = {
  id: string
  name: string
  facilitatorName: string | null
  facilitatorPresent: boolean
  subFacilitatorId: string | null
  subFacilitatorName: string | null
  coFacilitatorName: string | null
  coFacilitatorPresent: boolean
  subCoFacilitatorId: string | null
  subCoFacilitatorName: string | null
  newCount: number
  returneeCount: number
  totalCheckedIn: number
  /** Roster size vs member limit — distinct from the check-in counts above. */
  occupancy: BreakoutOccupancy
}

/**
 * Capacity as a bar plus the numbers, so "which group has the most room" reads
 * off the column instead of out of arithmetic.
 *
 * An uncapped group gets a dashed empty track rather than a 0%- or 100%-filled
 * one: any fill would be a claim about a limit that doesn't exist.
 */
function CapacityCell({ occupancy }: { occupancy: BreakoutOccupancy }) {
  const { fillRatio, isFull, isOver, label, memberCount, memberLimit, remaining } = occupancy

  if (memberLimit == null) {
    return (
      <div className="min-w-32 space-y-1">
        <div className="h-1.5 w-full rounded-full border border-dashed border-muted-foreground/30" />
        <p className="text-xs text-muted-foreground tabular-nums">
          {memberCount} assigned · No cap
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-32 space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isFull ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${(fillRatio ?? 0) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {label}
        {isOver ? (
          <span className="ml-1 text-destructive">Over by {memberCount - memberLimit}</span>
        ) : isFull ? (
          <span className="ml-1 text-destructive">Full</span>
        ) : (
          ` · ${remaining} left`
        )}
      </p>
    </div>
  )
}

type TypeFilter = "all" | "member" | "guest" | "volunteer"
type SessionTab = "attendees" | "breakouts"

function buildAttendeeColumns({
  eventId,
  canEdit,
  statusSortDirection,
  onToggleStatusSort,
  onSetStatus,
  onRemove,
}: {
  eventId: string
  canEdit: boolean
  statusSortDirection: AttendeeSortDirection
  onToggleStatusSort: () => void
  onSetStatus: (attendee: AttendeeRow, choice: AttendeeStatusChoice) => Promise<void>
  onRemove: (attendee: AttendeeRow) => void
}): ColumnDef<AttendeeRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={attendeeHref(eventId, row.original)}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.name ?? (
            <span className="text-muted-foreground italic">No name</span>
          )}
        </Link>
      ),
    },
    {
      id: "status",
      // The sort is the caller's (it reorders `sortedAttendees`), so the header
      // stays a custom control rather than TanStack's own sorting.
      meta: { label: "Status", width: "status" },
      header: () => (
        <button
          type="button"
          onClick={onToggleStatusSort}
          aria-label={`Sort status ${statusSortDirection === "asc" ? "descending" : "ascending"}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <span>Status</span>
          <span className="text-xs">{statusSortDirection === "asc" ? "\u2191" : "\u2193"}</span>
        </button>
      ),
      cell: ({ row }) => (
        <StatusBadge
          attendee={row.original}
          editable={canEdit && isAttendeeStatusEditable(row.original)}
          onSelect={(choice) => onSetStatus(row.original, choice)}
        />
      ),
    },
    {
      id: "type",
      header: "Type",
      meta: { label: "Type", width: "status" },
      cell: ({ row }) => <TypeBadge attendee={row.original} />,
    },
    {
      id: "breakoutGroup",
      accessorFn: (row) => row.breakoutGroupNames.join(", "),
      header: "Breakout Group",
      meta: { label: "Breakout Group", width: "name" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.breakoutGroupNames.length > 0 ? (
            row.original.breakoutGroupNames.join(", ")
          ) : (
            <span className="italic">Unassigned</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "checkedInAtFormatted",
      header: "Checked in at",
      meta: { label: "Checked in at", width: "date" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.checkedInAtFormatted}</span>
      ),
    },
    ...(canEdit
      ? [
          {
            id: "actions",
            meta: { width: "actions", locked: true },
            cell: ({ row }) => <RemoveAttendeeButton onSelect={() => onRemove(row.original)} />,
          } satisfies ColumnDef<AttendeeRow>,
        ]
      : []),
  ]
}

function buildBreakoutStatColumns({
  eventId,
  occurrenceId,
  volunteerOptions,
}: {
  eventId: string
  occurrenceId: string
  volunteerOptions: PersonComboboxOption[]
}): ColumnDef<BreakoutStatRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Group",
      meta: { label: "Group", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/breakouts/${row.original.id}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "facilitator",
      accessorFn: (row) => row.facilitatorName ?? "",
      header: "Facilitator",
      meta: { label: "Facilitator", width: "name", noTruncate: true },
      cell: ({ row }) => (
        <FacilitatorCell
          occurrenceId={occurrenceId}
          breakoutGroupId={row.original.id}
          eventId={eventId}
          role={FacilitatorRole.Facilitator}
          name={row.original.facilitatorName}
          present={row.original.facilitatorPresent}
          subId={row.original.subFacilitatorId}
          subName={row.original.subFacilitatorName}
          volunteerOptions={volunteerOptions}
        />
      ),
    },
    {
      id: "coFacilitator",
      accessorFn: (row) => row.coFacilitatorName ?? "",
      header: "Co-Facilitator",
      meta: { label: "Co-Facilitator", width: "name", noTruncate: true },
      cell: ({ row }) => (
        <FacilitatorCell
          occurrenceId={occurrenceId}
          breakoutGroupId={row.original.id}
          eventId={eventId}
          role={FacilitatorRole.CoFacilitator}
          name={row.original.coFacilitatorName}
          present={row.original.coFacilitatorPresent}
          subId={row.original.subCoFacilitatorId}
          subName={row.original.subCoFacilitatorName}
          volunteerOptions={volunteerOptions}
        />
      ),
    },
    // These three are today's turnout; Capacity is the roster. Labelling them
    // apart is the whole point — an admin reading "6" next to "8 / 12" must not
    // take them for the same number.
    //
    // They used to carry four different hand-picked widths (w-14/w-20/w-24/w-40)
    // in this one header row. All three counts are the same kind of value, so
    // they now say so.
    {
      accessorKey: "newCount",
      header: "New",
      meta: { label: "New", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.newCount}</span>,
    },
    {
      accessorKey: "returneeCount",
      header: "Returnees",
      meta: { label: "Returnees", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.returneeCount}</span>,
    },
    {
      accessorKey: "totalCheckedIn",
      header: "Here today",
      meta: { label: "Here today", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.totalCheckedIn}</span>,
    },
    {
      id: "capacity",
      header: "Capacity",
      meta: { label: "Capacity", width: "status", noTruncate: true },
      cell: ({ row }) => <CapacityCell occupancy={row.original.occupancy} />,
    },
  ]
}

export function SessionAttendeesTable({
  eventId,
  occurrenceId,
  attendees,
  breakoutGroups,
  breakoutStats,
  volunteerOptions,
  canEdit,
}: {
  eventId: string
  occurrenceId: string
  attendees: AttendeeRow[]
  breakoutGroups: BreakoutGroupOption[]
  breakoutStats: BreakoutStatRow[]
  volunteerOptions: PersonComboboxOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SessionTab>("attendees")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [breakoutFilter, setBreakoutFilter] = useState("all")
  const [statusSortDirection, setStatusSortDirection] = useState<AttendeeSortDirection>("asc")
  const [breakoutSort, setBreakoutSort] = useState<BreakoutStatSortMode>("name")
  const sortedBreakoutStats = useMemo(
    () => sortBreakoutStats(breakoutStats, breakoutSort),
    [breakoutStats, breakoutSort]
  )
  const [attendeeToRemove, setAttendeeToRemove] = useState<AttendeeRow | null>(null)

  // The server stays the source of truth, but edits paint locally first: re-rendering
  // this page server-side means re-running the breakout/facilitator/volunteer queries,
  // which is far too slow to sit behind a badge click or a row removal. A fresh payload
  // replaces the local copy the moment it lands.
  const [rows, setRows] = useState(attendees)
  const [lastServerRows, setLastServerRows] = useState(attendees)
  if (lastServerRows !== attendees) {
    setLastServerRows(attendees)
    setRows(attendees)
  }

  function patchRow(id: string, patch: Partial<AttendeeRow>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function handleSetStatus(attendee: AttendeeRow, choice: AttendeeStatusChoice) {
    const next = resolveStatusSelection(choice, attendee.derivedIsReturner)

    // Re-picking the status the row already has writes nothing. A menu makes that a normal
    // thing to do — someone opens it to check, then closes it by choosing what is checked.
    if (
      next.isReturner === attendee.isReturner &&
      (next.override !== null) === attendee.hasStatusOverride
    ) {
      return
    }

    patchRow(attendee.id, {
      isReturner: next.isReturner,
      hasStatusOverride: next.override !== null,
    })

    const result = await setAttendeeReturnerStatus(attendee.id, next.override)
    if (!result.success) {
      // Revert just this row — a sibling row may have been edited meanwhile.
      patchRow(attendee.id, {
        isReturner: attendee.isReturner,
        hasStatusOverride: attendee.hasStatusOverride,
      })
      toast.error(result.error)
      return
    }
    // Catches up everything this component doesn't own — the Breakout Groups counts
    // and the header subtitle — without holding up the badge.
    router.refresh()
  }

  async function handleRemoveAttendee() {
    const target = attendeeToRemove
    if (!target) return

    setAttendeeToRemove(null)
    setRows((current) => current.filter((r) => r.id !== target.id))

    const result = await removeSessionAttendee(target.id)
    if (!result.success) {
      setRows((current) =>
        current.some((r) => r.id === target.id) ? current : [...current, target],
      )
      toast.error(result.error)
      return
    }
    toast.success("Removed from this session")
    router.refresh()
  }

  const stats = useMemo(() => buildSessionAttendeeStats(rows), [rows])

  const filtered = useMemo(
    () =>
      rows.filter((a) => {
        if (typeFilter === "member" && (!a.isMember || a.isVolunteer)) return false
        if (typeFilter === "guest" && (a.isMember || a.isVolunteer)) return false
        if (typeFilter === "volunteer" && !a.isVolunteer) return false
        if (breakoutFilter !== "all" && !a.breakoutGroupIds.includes(breakoutFilter)) return false
        return true
      }),
    [rows, breakoutFilter, typeFilter],
  )

  const sortedAttendees = useMemo(
    () => sortSessionAttendees(filtered, statusSortDirection),
    [filtered, statusSortDirection],
  )

  const breakoutColumns = useMemo(
    () => buildBreakoutStatColumns({ eventId, occurrenceId, volunteerOptions }),
    [eventId, occurrenceId, volunteerOptions],
  )

  const attendeeColumns = useMemo(
    () =>
      buildAttendeeColumns({
        eventId,
        canEdit,
        statusSortDirection,
        onToggleStatusSort: () =>
          setStatusSortDirection((current) => (current === "asc" ? "desc" : "asc")),
        onSetStatus: handleSetStatus,
        onRemove: setAttendeeToRemove,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, canEdit, statusSortDirection],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Derived from the same rows the table renders, so the counters move with an
          optimistic edit instead of trailing a server round-trip behind it. */}
      {/* Two-up until `lg`: the event workspace sidebar is still expanded at tablet
          widths, and four tiles in the ~512px that leaves squeezes the uppercase
          labels into two lines each. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={stats.totalCount}
          icon={<Users className="size-4" />}
          genderBar={{ men: stats.menCount, women: stats.womenCount }}
        />
        <StatCard label="New" value={stats.newCount} icon={<UserPlus className="size-4" />} />
        <StatCard
          label="Participants"
          value={stats.participantCount}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Volunteers"
          value={stats.volunteersPresent}
          icon={<UserCheck className="size-4" />}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SessionTab)}
        className="space-y-3"
      >
        <TabsList variant="line">
          <TabsTrigger value="attendees" className="after:-bottom-px">
            Attendees
          </TabsTrigger>
          <TabsTrigger value="breakouts" className="after:-bottom-px">
            Breakout Groups
          </TabsTrigger>
        </TabsList>

        {/* Wraps rather than scrolls sideways: a filter you have to swipe to
            discover is a filter nobody uses. Controls are also finger-sized below
            `lg` and only shrink to the compact desktop height above it. */}
        {activeTab === "attendees" && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <ToggleGroup
              type="single"
              value={typeFilter}
              onValueChange={(v) => setTypeFilter((v || "all") as TypeFilter)}
              className="flex-wrap gap-1"
            >
              <ToggleGroupItem value="all" className="h-9 px-3 text-xs xl:h-7">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="member" className="h-9 px-3 text-xs xl:h-7">
                Members
              </ToggleGroupItem>
              <ToggleGroupItem value="guest" className="h-9 px-3 text-xs xl:h-7">
                Guests
              </ToggleGroupItem>
              <ToggleGroupItem value="volunteer" className="h-9 px-3 text-xs xl:h-7">
                Volunteers
              </ToggleGroupItem>
            </ToggleGroup>

            {breakoutGroups.length > 0 && (
              <Select value={breakoutFilter} onValueChange={setBreakoutFilter}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-44 xl:h-7 xl:w-40">
                  <SelectValue placeholder="Breakout group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {breakoutGroups.map((bg) => (
                    <SelectItem key={bg.id} value={bg.id}>
                      {bg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <TabsContent value="attendees" className="mt-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <p className="text-sm">No one checked in for this session yet.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <p className="text-sm">No attendees match the current filters.</p>
            </div>
          ) : (
            <>
              {/* Phone + tablet card list. `auto-fill` rather than a viewport
                  breakpoint: the workspace sidebar is expanded at tablet widths, so
                  a `sm:grid-cols-2` would split a ~460px column into two 200px cards
                  and truncate every name. Columns appear only once the container can
                  actually seat another 20rem card — which also means it adapts when
                  the sidebar collapses. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-2 xl:hidden">
                {sortedAttendees.map((a) => (
                  <div key={a.id} className="rounded-lg border px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <Link
                        href={attendeeHref(eventId, a)}
                        // `block` is load-bearing: `truncate` sets overflow, which
                        // an inline anchor ignores — a long name would push the
                        // status control off the card instead of clipping.
                        className="block min-w-0 flex-1 truncate text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                      </Link>
                      {/* Status and remove sit on the name's baseline row rather than
                          in their own stacked column, so they stay aligned with each
                          other however tall the meta line below wraps. */}
                      <div className="flex shrink-0 items-center gap-1">
                        <StatusBadge
                          attendee={a}
                          editable={canEdit && isAttendeeStatusEditable(a)}
                          onSelect={(choice) => handleSetStatus(a, choice)}
                        />
                        {canEdit && (
                          <RemoveAttendeeButton onSelect={() => setAttendeeToRemove(a)} />
                        )}
                      </div>
                    </div>
                    {/* One meta line instead of a badge row plus a breakout row plus
                        a loose timestamp — same facts, a third of the height, so a
                        full session fits in far fewer scrolls. Nothing wraps, so
                        every card is exactly two lines and the check-in times line
                        up down the right edge like a column. */}
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <TypeBadge attendee={a} />
                      <span className="min-w-0 flex-1 truncate">
                        {a.breakoutGroupNames.length > 0 ? (
                          a.breakoutGroupNames.join(", ")
                        ) : (
                          <span className="italic">Unassigned</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className="sr-only">Checked in at </span>
                        {a.checkedInAtFormatted}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table — six columns need the width a sidebar-less viewport gives. */}
              <div className="hidden xl:flex xl:flex-1 xl:flex-col">
                <DataTable
                  tableKey="event.session-attendees"
                  rowLabel={{ one: "attendee", many: "attendees" }}
                  columns={attendeeColumns}
                  data={sortedAttendees}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="breakouts" className="mt-0">
          {breakoutStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <p className="text-sm">No breakout groups configured for this event.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end gap-2">
                <Label htmlFor="breakout-sort" className="text-xs text-muted-foreground">
                  Sort by
                </Label>
                <Select
                  value={breakoutSort}
                  onValueChange={(v) => setBreakoutSort(v as BreakoutStatSortMode)}
                >
                  <SelectTrigger id="breakout-sort" size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="room">Most room</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Phone + tablet card list — the seven-column table below carries two
                  interactive facilitator popovers and a capacity bar, none of which
                  survive being squeezed into a tablet's content column. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-2 xl:hidden">
                {sortedBreakoutStats.map((bg) => (
                  <div key={bg.id} className="space-y-2.5 rounded-lg border px-3 py-2.5">
                    <Link
                      href={`/event/${eventId}/breakouts/${bg.id}`}
                      className="block truncate text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
                    >
                      {bg.name}
                    </Link>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
                        <span className="pt-0.5 text-xs text-muted-foreground">Facilitator</span>
                        <FacilitatorCell
                          occurrenceId={occurrenceId}
                          breakoutGroupId={bg.id}
                          eventId={eventId}
                          role={FacilitatorRole.Facilitator}
                          name={bg.facilitatorName}
                          present={bg.facilitatorPresent}
                          subId={bg.subFacilitatorId}
                          subName={bg.subFacilitatorName}
                          volunteerOptions={volunteerOptions}
                        />
                      </div>
                      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
                        <span className="pt-0.5 text-xs text-muted-foreground">Co-Fac</span>
                        <FacilitatorCell
                          occurrenceId={occurrenceId}
                          breakoutGroupId={bg.id}
                          eventId={eventId}
                          role={FacilitatorRole.CoFacilitator}
                          name={bg.coFacilitatorName}
                          present={bg.coFacilitatorPresent}
                          subId={bg.subCoFacilitatorId}
                          subName={bg.subCoFacilitatorName}
                          volunteerOptions={volunteerOptions}
                        />
                      </div>
                    </div>
                    {/* Turnout and capacity share a boxed footer but stay visibly
                        apart — same reason the table labels them as separate
                        columns. "Here today" is who showed up; capacity is the
                        roster. Equal thirds keep the numbers on a shared grid at
                        any card width. */}
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      {/* `nowrap` on the labels: a wrapped "Here today" pushes its
                          figure down a line and the three numbers stop reading as a
                          row, which is the only reason they are next to each other. */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground">New</p>
                          <p className="text-sm font-semibold tabular-nums">{bg.newCount}</p>
                        </div>
                        <div>
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                            Returning
                          </p>
                          <p className="text-sm font-semibold tabular-nums">{bg.returneeCount}</p>
                        </div>
                        <div>
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                            Here today
                          </p>
                          <p className="text-sm font-semibold tabular-nums">{bg.totalCheckedIn}</p>
                        </div>
                      </div>
                      <div className="mt-2 border-t pt-2">
                        <p className="mb-1 text-[11px] text-muted-foreground">Capacity</p>
                        <CapacityCell occupancy={bg.occupancy} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden xl:flex xl:flex-1 xl:flex-col">
                <DataTable
                  tableKey="event.session-breakouts"
                  rowLabel={{ one: "group", many: "groups" }}
                  columns={breakoutColumns}
                  data={sortedBreakoutStats}
                  hidePagination
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={attendeeToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAttendeeToRemove(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from session</DialogTitle>
            <DialogDescription>
              {attendeeToRemove ? (
                <>
                  Remove{" "}
                  <span className="font-medium">
                    {attendeeToRemove.name ?? "this attendee"}
                  </span>{" "}
                  from this session&apos;s checked-in list? Their registration and
                  attendance in other sessions stay untouched.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendeeToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveAttendee}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PresenceCell({ name, present }: { name: string | null; present: boolean }) {
  if (!name) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {present ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
      ) : (
        <XCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
      )}
      <span className="truncate text-sm">{name}</span>
    </div>
  )
}

function FacilitatorCell({
  occurrenceId,
  breakoutGroupId,
  eventId,
  role,
  name,
  present,
  subId,
  subName,
  volunteerOptions,
}: {
  occurrenceId: string
  breakoutGroupId: string
  eventId: string
  role: FacilitatorRole
  name: string | null
  present: boolean
  subId: string | null
  subName: string | null
  volunteerOptions: PersonComboboxOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return volunteerOptions
    return volunteerOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [volunteerOptions, query])

  // Present facilitator — static, no interaction
  if (present) {
    return <PresenceCell name={name} present={present} />
  }

  async function handleSelect(volunteerId: string) {
    setLoading(true)
    const result = await assignSubFacilitator(occurrenceId, breakoutGroupId, role, volunteerId)
    setLoading(false)
    if (!result.success) {
      toast.error(result.error)
    } else {
      setOpen(false)
      setQuery("")
      router.refresh()
    }
  }

  async function handleRemove() {
    setLoading(true)
    const result = await removeSubFacilitator(occurrenceId, breakoutGroupId, role, eventId)
    setLoading(false)
    if (!result.success) {
      toast.error(result.error)
    } else {
      setOpen(false)
      setQuery("")
      router.refresh()
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setQuery("")
  }

  // Below `xl` these triggers live inside a card and are tapped, not clicked: the
  // row gets real vertical padding so it clears a fingertip, and the name is free
  // to truncate rather than shove the "Sub" badge out of the card.
  const triggerBase =
    // `w-full` only below `xl`: in the card it fills the row so the whole line is
    // tappable, but inside a table cell it would let the column squeeze the name
    // into an ellipsis when the column had room to simply be wider.
    "flex w-full items-center gap-1.5 rounded px-1 -mx-1 py-1.5 hover:bg-accent transition-colors text-left xl:w-auto xl:py-0"

  const trigger = subId ? (
    // Sub assigned — amber styled cell trigger
    <button
      type="button"
      className={triggerBase}
      aria-label="Reassign or remove sub-facilitator"
    >
      <ArrowLeftRight className="size-3.5 shrink-0 text-amber-500" />
      <span className="truncate text-sm">{subName}</span>
      <Badge
        variant="outline"
        className="h-4 shrink-0 px-1 text-[10px] border-amber-400 text-amber-600"
      >
        Sub
      </Badge>
    </button>
  ) : (
    // Absent, no sub — show original name with ❌ + assign cue. The cue is always
    // visible below `xl`: a hover-only affordance never appears on a touch screen,
    // which is exactly where sub-facilitators get assigned mid-session.
    <button
      type="button"
      className={cn(triggerBase, "group")}
      aria-label="Assign sub-facilitator"
    >
      <XCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
      <span className="truncate text-sm">
        {name ?? <span className="text-muted-foreground">No facilitator</span>}
      </span>
      <span className="ml-0.5 shrink-0 text-[10px] text-muted-foreground transition-colors xl:text-muted-foreground/60 xl:group-hover:text-muted-foreground">
        + sub
      </span>
    </button>
  )

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-56 rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="flex items-center border-b px-2">
            <SearchIcon className="mr-1.5 size-3.5 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search volunteer…"
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ml-1.5 opacity-50 hover:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto p-1">
            {subId && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={loading}
                className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent hover:text-destructive"
              >
                Remove sub
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No volunteers found.</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  disabled={loading}
                  className={cn(
                    "relative flex w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    opt.value === subId && "bg-accent/50",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
