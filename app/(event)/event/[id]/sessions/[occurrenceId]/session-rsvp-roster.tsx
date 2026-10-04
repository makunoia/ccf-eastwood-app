"use client"

import { useState } from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type SessionRsvpRow = { registrantId: string; name: string; isMember: boolean; checkedIn: boolean }
export function SessionRsvpRoster({ eventId, rows }: { eventId: string; rows: SessionRsvpRow[] }) {
  const [search, setSearch] = useState("")
  const [attendance, setAttendance] = useState("all")
  const columns: ColumnDef<SessionRsvpRow>[] = [
    { id: "name", accessorKey: "name", header: "Name", meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => <Link href={`/event/${eventId}/registrants/${row.original.registrantId}`} className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors">{row.original.name}</Link> },
    { id: "type", header: "Type", meta: { label: "Type", width: "status" }, cell: ({ row }) => row.original.isMember ? "Member" : "Guest" },
    { id: "rsvp", header: "RSVP", meta: { label: "RSVP", width: "status" }, cell: () => <Badge variant="secondary">Expected</Badge> },
    { id: "attendance", header: "Attendance", meta: { label: "Attendance", width: "status" }, cell: ({ row }) => row.original.checkedIn ? "Checked in" : "Not checked in" },
  ]
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) && (attendance === "all" || r.checkedIn === (attendance === "present")))
  return <div className="space-y-4">
    <FilterBar searchValue={search} onSearch={setSearch} searchPlaceholder="Search expected participants…" activeCount={attendance === "all" ? 0 : 1} hasActive={!!search || attendance !== "all"} onClear={() => { setSearch(""); setAttendance("all") }}>
      <FilterField label="Attendance"><Select value={attendance} onValueChange={setAttendance}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All expected participants</SelectItem><SelectItem value="present">Checked in</SelectItem><SelectItem value="absent">Not checked in</SelectItem></SelectContent></Select></FilterField>
    </FilterBar>
    <DataTable columns={columns} data={filtered} tableKey="event.session-rsvps" rowLabel={{ one: "participant", many: "participants" }} />
  </div>
}
