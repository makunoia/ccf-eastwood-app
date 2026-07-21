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
import { CopyCatchMechLink } from "./copy-catch-mech-link"

export type SubmissionRow = {
  id: string
  submittedByName: string
  breakoutGroupId: string | null
  breakoutGroupName: string | null
  confirmedCount: number
  declinedCount: number
  deferredCount: number
  createdGroupId: string | null
  createdAt: Date
}

export type NonResponder = {
  volunteerId: string
  name: string
  breakoutGroupId: string
  breakoutGroupName: string
}

type Props = {
  eventId: string
  rows: SubmissionRow[]
  nonResponders: NonResponder[]
  respondedCount: number
  expectedCount: number
  breakoutGroups: { id: string; name: string }[]
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

export function SubmissionsClient({
  eventId,
  rows,
  nonResponders,
  respondedCount,
  expectedCount,
  breakoutGroups,
}: Props) {
  const [filterGroup, setFilterGroup] = React.useState("all")

  const filteredRows =
    filterGroup === "all" ? rows : rows.filter((r) => r.breakoutGroupId === filterGroup)
  const filteredNonResponders =
    filterGroup === "all"
      ? nonResponders
      : nonResponders.filter((n) => n.breakoutGroupId === filterGroup)

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
        <span className="text-foreground font-medium">Submissions</span>
      </nav>

      <PageHeader
        title="Submissions"
        description={`${respondedCount} of ${expectedCount} facilitators responded`}
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
                    <SelectItem key={bg.id} value={bg.id}>
                      {bg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>
        }
      />

      {/* Every submission, newest first. Repeat submissions are separate rows on
          purpose — a faci answering twice is exactly what this page exists to show. */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Facilitator</TableHead>
              <TableHead>Breakout Group</TableHead>
              <TableHead className="text-right">Confirmed</TableHead>
              <TableHead className="text-right">Declined</TableHead>
              <TableHead className="text-right">Deferred</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  No submissions yet
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="font-medium">{row.submittedByName}</span>
                    {row.createdGroupId && (
                      <Badge variant="secondary" className="ml-2">
                        Created group
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.breakoutGroupId && row.breakoutGroupName ? (
                      <Link
                        href={`/event/${eventId}/breakouts/${row.breakoutGroupId}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {row.breakoutGroupName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.confirmedCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.declinedCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.deferredCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Chase list */}
      <div className="space-y-3">
        <h3 className="type-label text-muted-foreground">
          No response yet ({filteredNonResponders.length})
        </h3>
        {filteredNonResponders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Every facilitator has responded
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facilitator</TableHead>
                  <TableHead>Breakout Group</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNonResponders.map((n) => (
                  <TableRow key={n.volunteerId}>
                    <TableCell className="font-medium">{n.name}</TableCell>
                    <TableCell>
                      <Link
                        href={`/event/${eventId}/breakouts/${n.breakoutGroupId}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {n.breakoutGroupName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* The event-level entry URL, not a per-faci token: tokens are
                          minted when the faci verifies their mobile, so someone who
                          has not responded has no link of their own yet. */}
                      <CopyCatchMechLink path={`/events/${eventId}/catch-mech`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
