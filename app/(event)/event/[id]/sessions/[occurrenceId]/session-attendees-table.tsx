"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle } from "lucide-react"
import { IconUpload } from "@tabler/icons-react"
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
import {
  checkSessionAttendanceDuplicates,
  importSessionAttendance,
} from "./import-actions"

export type AttendeeRow = {
  id: string
  name: string
  checkedInAtFormatted: string
  isReturner: boolean
  isMember: boolean
  isVolunteer: boolean
  breakoutGroupIds: string[]
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
  coFacilitatorName: string | null
  coFacilitatorPresent: boolean
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
}: {
  eventId: string
  occurrenceId: string
  attendees: AttendeeRow[]
  breakoutGroups: BreakoutGroupOption[]
  breakoutStats: BreakoutStatRow[]
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
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
                <SelectTrigger className="h-7 w-[160px] text-xs">
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

          <p className="text-xs text-muted-foreground">
            {filtered.length} of {attendees.length} attendee{attendees.length === 1 ? "" : "s"}
          </p>
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
          <div className="overflow-x-auto rounded-lg border">
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
                    <TableCell className="font-medium">{a.name}</TableCell>
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
                          <Badge variant="outline" className="text-amber-600 border-amber-400">
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
        )}
      </TabsContent>

      <TabsContent value="breakouts" className="mt-0">
        {breakoutStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <p className="text-sm">No breakout groups configured for this event.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
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
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {bg.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <PresenceCell name={bg.facilitatorName} present={bg.facilitatorPresent} />
                    </TableCell>
                    <TableCell>
                      <PresenceCell
                        name={bg.coFacilitatorName}
                        present={bg.coFacilitatorPresent}
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
