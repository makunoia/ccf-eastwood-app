"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
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

export type StatusListRow = {
  requestId: string
  registrantId: string
  name: string
  type: "Member" | "Guest"
  breakoutGroupName: string
  smallGroupName: string | null  // null for Rejected
}

type Props = {
  rows: StatusListRow[]
  status: "confirmed" | "pending" | "rejected"
  eventId: string
  breakoutGroups: { id: string; name: string }[]
}

const STATUS_LABEL: Record<Props["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  rejected: "Rejected",
}

export function StatusListClient({ rows, status, eventId, breakoutGroups }: Props) {
  const [filterGroup, setFilterGroup] = React.useState("all")

  const filtered = filterGroup === "all"
    ? rows
    : rows.filter((r) => r.breakoutGroupName === filterGroup)

  const label = STATUS_LABEL[status]

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          href={`/event/${eventId}/catch-mech`}
          className="hover:text-foreground transition-colors"
        >
          ← Catch Mech
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{label}</span>
      </nav>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Breakout Group</span>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-52">
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
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Breakout Group</TableHead>
              {status !== "rejected" && <TableHead>Small Group</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={status !== "rejected" ? 4 : 3} className="py-6 text-center text-muted-foreground">
                  No {label.toLowerCase()} registrants.
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
                  {status !== "rejected" && (
                    <TableCell>
                      {row.smallGroupName ?? <span className="text-muted-foreground">—</span>}
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
