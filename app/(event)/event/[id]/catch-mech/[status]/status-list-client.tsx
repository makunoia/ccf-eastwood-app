"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { PageHeader } from "@/components/page-header"
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
import { CatchMechUndoButton } from "../catch-mech-undo-button"
import { SLUG_CONFIG, type CatchMechSlug } from "../status-slug"

export type StatusListRow = {
  requestId: string
  registrantId: string
  name: string
  type: "Member" | "Guest"
  breakoutGroupName: string
  smallGroupName: string | null  // null for the declined statuses
  declineReason: string | null   // display string, only set for declined rows
  rejectedByName: string | null  // facilitator name, only set for declined rows
}

type Props = {
  rows: StatusListRow[]
  status: CatchMechSlug
  eventId: string
  breakoutGroups: { id: string; name: string }[]
}

export function StatusListClient({ rows, status, eventId, breakoutGroups }: Props) {
  const [filterGroup, setFilterGroup] = React.useState("all")

  const filtered = filterGroup === "all"
    ? rows
    : rows.filter((r) => r.breakoutGroupName === filterGroup)

  const label = SLUG_CONFIG[status].label
  // Both declined slugs carry a reason and a decider; the reason is the entire point
  // of separating in-small-group out, so it shows there too.
  const isDeclined = status === "rejected" || status === "in-small-group"
  const canUndo = status !== "pending"

  // Derived from the rendered columns rather than hand-counted: the old `4 + …` form
  // baked in "exactly one of Small Group / Reason renders", which the 4th slug breaks.
  const colCount = [
    true,        // Name
    true,        // Type
    true,        // Breakout Group
    true,        // Small Group | Reason
    isDeclined,  // Declined by
    canUndo,     // Undo
  ].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href={`/event/${eventId}/catch-mech`}
          className="hover:text-foreground transition-colors"
        >
          Catch Mech
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium">{label}</span>
      </nav>

      {/* Header + filter */}
      <PageHeader
        title={label}
        description={`${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
        actions={
          <FilterBar
            activeCount={filterGroup === "all" ? 0 : 1}
            onClear={() => setFilterGroup("all")}
          >
            <FilterField label="Group">
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {breakoutGroups.map((bg) => (
                    <SelectItem key={bg.id} value={bg.name}>
                      {bg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>
        }
      />

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Breakout Group</TableHead>
              {isDeclined ? <TableHead>Reason</TableHead> : <TableHead>Small Group</TableHead>}
              {isDeclined && <TableHead>Declined by</TableHead>}
              {canUndo && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-6 text-center text-muted-foreground">
                  {status === "in-small-group"
                    ? "No registrants were declined as already in a small group."
                    : `No ${label.toLowerCase()} registrants.`}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.requestId}>
                  <TableCell>
                    <Link
                      href={`/event/${eventId}/catch-mech/${status}/${row.registrantId}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.type === "Member" ? "secondary" : "outline"}>
                      {row.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.breakoutGroupName}</TableCell>
                  {isDeclined ? (
                    <TableCell>
                      {row.declineReason ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ) : (
                    <TableCell>
                      {row.smallGroupName ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {isDeclined && (
                    <TableCell>
                      {row.rejectedByName ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {canUndo && (
                    <TableCell>
                      <CatchMechUndoButton
                        requestId={row.requestId}
                        eventId={eventId}
                        decision={status === "confirmed" ? "Confirmed" : "Rejected"}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
