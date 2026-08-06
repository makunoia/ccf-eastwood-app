"use client"

import { useState, useRef, useMemo } from "react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  buildSessionAttendeeStats,
  isAttendeeStatusEditable,
  resolveStatusSelection,
  sortSessionAttendees,
  type AttendeeSortDirection,
  type AttendeeStatusChoice,
} from "@/lib/session-attendees"
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
}

type TypeFilter = "all" | "member" | "guest" | "volunteer"
type SessionTab = "attendees" | "breakouts"

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

  return (
    <div className="flex flex-col gap-6">
      {/* Derived from the same rows the table renders, so the counters move with an
          optimistic edit instead of trailing a server round-trip behind it. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        {activeTab === "attendees" && (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex min-w-max items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter((v || "all") as TypeFilter)}
                  className="gap-1"
                >
                  <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
                    All
                  </ToggleGroupItem>
                  <ToggleGroupItem value="member" className="h-7 px-3 text-xs">
                    Members
                  </ToggleGroupItem>
                  <ToggleGroupItem value="guest" className="h-7 px-3 text-xs">
                    Guests
                  </ToggleGroupItem>
                  <ToggleGroupItem value="volunteer" className="h-7 px-3 text-xs">
                    Volunteers
                  </ToggleGroupItem>
                </ToggleGroup>

                {breakoutGroups.length > 0 && (
                  <Select value={breakoutFilter} onValueChange={setBreakoutFilter}>
                    <SelectTrigger className="h-7 w-40 text-xs">
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
            </div>
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
              {/* Mobile card list */}
              <div className="sm:hidden divide-y rounded-lg border">
                {sortedAttendees.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={attendeeHref(eventId, a)}
                        className="truncate text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.isVolunteer ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-600">
                            Volunteer
                          </Badge>
                        ) : a.isMember ? (
                          <Badge variant="secondary">Member</Badge>
                        ) : (
                          <Badge variant="outline">Guest</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Breakout:{" "}
                        {a.breakoutGroupNames.length > 0 ? (
                          a.breakoutGroupNames.join(", ")
                        ) : (
                          <span className="italic">Unassigned</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge
                        attendee={a}
                        editable={canEdit && isAttendeeStatusEditable(a)}
                        onSelect={(choice) => handleSetStatus(a, choice)}
                      />
                      <span className="text-xs text-muted-foreground">{a.checkedInAtFormatted}</span>
                    </div>
                    {canEdit && (
                      <RemoveAttendeeButton onSelect={() => setAttendeeToRemove(a)} />
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-lg border sm:block">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() =>
                            setStatusSortDirection((current) =>
                              current === "asc" ? "desc" : "asc",
                            )
                          }
                          aria-label={`Sort status ${statusSortDirection === "asc" ? "descending" : "ascending"}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          )}
                        >
                          <span>Status</span>
                          <span className="text-xs">
                            {statusSortDirection === "asc" ? "\u2191" : "\u2193"}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Breakout Group</TableHead>
                      <TableHead>Checked in at</TableHead>
                      {canEdit && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAttendees.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link
                            href={attendeeHref(eventId, a)}
                            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                          >
                            {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            attendee={a}
                            editable={canEdit && isAttendeeStatusEditable(a)}
                            onSelect={(choice) => handleSetStatus(a, choice)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {a.isVolunteer ? (
                              <Badge
                                variant="outline"
                                className="border-amber-400 text-amber-600"
                              >
                                Volunteer
                              </Badge>
                            ) : a.isMember ? (
                              <Badge variant="secondary">Member</Badge>
                            ) : (
                              <Badge variant="outline">Guest</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.breakoutGroupNames.length > 0 ? (
                            a.breakoutGroupNames.join(", ")
                          ) : (
                            <span className="italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.checkedInAtFormatted}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="w-10 text-right">
                            <RemoveAttendeeButton onSelect={() => setAttendeeToRemove(a)} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
              {/* Mobile card list */}
              <div className="sm:hidden divide-y rounded-lg border">
                {breakoutStats.map((bg) => (
                  <div key={bg.id} className="space-y-2.5 px-4 py-3">
                    <Link
                      href={`/event/${eventId}/breakouts/${bg.id}`}
                      className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
                    >
                      {bg.name}
                    </Link>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
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
                      <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
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
                    <div className="flex gap-5">
                      <div>
                        <p className="text-xs text-muted-foreground">New</p>
                        <p className="text-sm font-semibold tabular-nums">{bg.newCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Returning</p>
                        <p className="text-sm font-semibold tabular-nums">{bg.returneeCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold tabular-nums">{bg.totalCheckedIn}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-lg border sm:block">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Facilitator</TableHead>
                      <TableHead>Co-Facilitator</TableHead>
                      <TableHead className="text-right">New</TableHead>
                      <TableHead className="text-right">Returnees</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakoutStats.map((bg) => (
                      <TableRow key={bg.id}>
                        <TableCell>
                          <Link
                            href={`/event/${eventId}/breakouts/${bg.id}`}
                            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
                          >
                            {bg.name}
                          </Link>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{bg.newCount}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bg.returneeCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bg.totalCheckedIn}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
    <div className="flex items-center gap-1.5">
      {present ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
      ) : (
        <XCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
      )}
      <span>{name}</span>
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

  const trigger = subId ? (
    // Sub assigned — amber styled cell trigger
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-accent transition-colors text-left"
      aria-label="Reassign or remove sub-facilitator"
    >
      <ArrowLeftRight className="size-3.5 shrink-0 text-amber-500" />
      <span className="text-sm">{subName}</span>
      <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-400 text-amber-600">
        Sub
      </Badge>
    </button>
  ) : (
    // Absent, no sub — show original name with ❌ + subtle assign cue
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-accent transition-colors text-left group"
      aria-label="Assign sub-facilitator"
    >
      <XCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
      <span className="text-sm">{name ?? <span className="text-muted-foreground">No facilitator</span>}</span>
      <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors ml-0.5">
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
