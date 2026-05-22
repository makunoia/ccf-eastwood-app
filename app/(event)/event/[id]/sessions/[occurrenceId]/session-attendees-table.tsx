"use client"

import { useState, useRef, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle, ArrowLeftRight, SearchIcon, XIcon } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { ImportWizard } from "@/components/import/import-wizard"
import { cn } from "@/lib/utils"
import type { PersonComboboxOption } from "@/components/ui/person-combobox"
import {
  checkSessionAttendanceDuplicates,
  importSessionAttendance,
} from "./import-actions"
import {
  assignSubFacilitator,
  removeSubFacilitator,
} from "./sub-facilitator-actions"
// Mirrors the Prisma enum — avoid importing Prisma client in client components (pulls node:module)
const FacilitatorRole = { Facilitator: "Facilitator", CoFacilitator: "CoFacilitator" } as const
type FacilitatorRole = (typeof FacilitatorRole)[keyof typeof FacilitatorRole]

export type AttendeeRow = {
  id: string
  registrantId: string
  name: string | null
  checkedInAtFormatted: string
  isReturner: boolean
  isMember: boolean
  isVolunteer: boolean
  breakoutGroupIds: string[]
  gender: "Male" | "Female" | null
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
}: {
  eventId: string
  occurrenceId: string
  attendees: AttendeeRow[]
  breakoutGroups: BreakoutGroupOption[]
  breakoutStats: BreakoutStatRow[]
  volunteerOptions: PersonComboboxOption[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SessionTab>("attendees")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [breakoutFilter, setBreakoutFilter] = useState("all")
  const [importOpen, setImportOpen] = useState(false)

  const filtered = attendees.filter((a) => {
    if (typeFilter === "member" && !a.isMember) return false
    if (typeFilter === "guest" && a.isMember) return false
    if (typeFilter === "volunteer" && !a.isVolunteer) return false
    if (breakoutFilter !== "all" && !a.breakoutGroupIds.includes(breakoutFilter)) return false
    return true
  })

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as SessionTab)}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line">
          <TabsTrigger value="attendees" className="after:-bottom-px">
            Attendees
          </TabsTrigger>
          <TabsTrigger value="breakouts" className="after:-bottom-px">
            Breakout Groups
          </TabsTrigger>
        </TabsList>

        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <IconUpload className="mr-1.5 size-3.5" />
          Import
        </Button>
      </div>

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
        {attendees.length === 0 ? (
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
              {filtered.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/event/${eventId}/registrants/${a.registrantId}`}
                      className="truncate text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.isMember ? (
                        <Badge variant="secondary">Member</Badge>
                      ) : (
                        <Badge variant="outline">Guest</Badge>
                      )}
                      {a.isVolunteer && (
                        <Badge variant="outline" className="border-amber-400 text-amber-600">
                          Volunteer
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a.isReturner ? (
                      <Badge variant="secondary">Returning</Badge>
                    ) : (
                      <Badge>New</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{a.checkedInAtFormatted}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border sm:block">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Checked in at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/event/${eventId}/registrants/${a.registrantId}`}
                          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                        >
                          {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {a.isReturner ? (
                          <Badge variant="secondary">Returning</Badge>
                        ) : (
                          <Badge>New</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {a.isMember ? (
                            <Badge variant="secondary">Member</Badge>
                          ) : (
                            <Badge variant="outline">Guest</Badge>
                          )}
                          {a.isVolunteer && (
                            <Badge variant="outline" className="border-amber-400 text-amber-600">
                              Volunteer
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.checkedInAtFormatted}
                      </TableCell>
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

      <ImportWizard
        config={{
          entity: "session-attendance",
          onSuccess: () => router.refresh(),
        }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={(rows) =>
          checkSessionAttendanceDuplicates(
            occurrenceId,
            rows.map((r) => ({ email: r.email, phone: r.phone })),
          )
        }
        onImport={(rows) => importSessionAttendance(occurrenceId, rows)}
      />
    </Tabs>
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
