"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import {
  SubmissionDecisions,
  type SubmissionDecision,
} from "@/components/catch-mech/submission-decisions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/ui/data-table"

/**
 * One person a volunteer decided on. Same shape as the facilitator side — the
 * two submission surfaces render their detail with the same component.
 */
export type VolunteerFollowUpDecision = SubmissionDecision

export type VolunteerFollowUpSubmission = {
  id: string
  volunteerId: string
  volunteerName: string
  committeeName: string
  roleName: string
  placedCount: number
  decisions: VolunteerFollowUpDecision[]
  createdAt: Date
}

export type VolunteerFollowUpNonResponder = {
  id: string
  volunteerName: string
  committeeName: string
  roleName: string
}

type Props = {
  eventId: string
  submissions: VolunteerFollowUpSubmission[]
  nonResponders: VolunteerFollowUpNonResponder[]
  committees: string[]
  canViewMember: boolean
  canViewSmallGroup: boolean
}

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

function buildSubmissionColumns(
  expanded: Set<string>,
): ColumnDef<VolunteerFollowUpSubmission>[] {
  return [
    {
      id: "expander",
      meta: { width: "micro", locked: true, stopRowClick: true },
      cell: ({ row }) => {
        // A submission from before this trail existed has counts but no stored
        // names, so the expander is driven by what we can actually show.
        if (row.original.decisions.length === 0) return null
        return (
          <span aria-hidden className="inline-flex rounded-md p-1 text-muted-foreground">
            <ChevronRight
              className={`size-4 transition-transform ${expanded.has(row.original.id) ? "rotate-90" : ""}`}
            />
          </span>
        )
      },
    },
    {
      accessorKey: "volunteerName",
      header: "Volunteer",
      meta: { label: "Volunteer", width: "name", locked: true },
      cell: ({ row }) => <span className="font-medium">{row.original.volunteerName}</span>,
    },
    {
      accessorKey: "committeeName",
      header: "Committee",
      meta: { label: "Committee", width: "text" },
    },
    {
      accessorKey: "roleName",
      header: "Role",
      meta: { label: "Role", width: "text" },
    },
    {
      accessorKey: "placedCount",
      header: "Placed",
      meta: { label: "Placed", width: "narrow", align: "right" },
      cell: ({ row }) =>
        row.original.placedCount === 0 ? (
          <Badge variant="secondary">None</Badge>
        ) : (
          <span className="tabular-nums">{row.original.placedCount}</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Submitted",
      meta: { label: "Submitted", width: "date" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
  ]
}

const nonResponderColumns: ColumnDef<VolunteerFollowUpNonResponder>[] = [
  {
    accessorKey: "volunteerName",
    header: "Volunteer",
    meta: { label: "Volunteer", width: "name", locked: true },
    cell: ({ row }) => <span className="font-medium">{row.original.volunteerName}</span>,
  },
  {
    accessorKey: "committeeName",
    header: "Committee",
    meta: { label: "Committee", width: "text" },
  },
  {
    accessorKey: "roleName",
    header: "Role",
    meta: { label: "Role", width: "text" },
  },
]

export function VolunteerFollowUpClient({
  eventId,
  submissions,
  nonResponders,
  committees,
  canViewMember,
  canViewSmallGroup,
}: Props) {
  const [committee, setCommittee] = React.useState("all")
  const [responseState, setResponseState] = React.useState("all")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const submissionColumns = React.useMemo(() => buildSubmissionColumns(expanded), [expanded])
  const activeCount = Number(committee !== "all") + Number(responseState !== "all")

  function toggleRow(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const matchesCommittee = (value: string) => committee === "all" || value === committee
  const visibleSubmissions =
    responseState === "not-responded"
      ? []
      : submissions.filter((submission) => matchesCommittee(submission.committeeName))
  const visibleNonResponders =
    responseState === "responded"
      ? []
      : nonResponders.filter((volunteer) => matchesCommittee(volunteer.committeeName))

  const respondedVolunteerIds = new Set(submissions.map((submission) => submission.volunteerId))
  const totalVolunteers = respondedVolunteerIds.size + nonResponders.length

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/event/${eventId}/catch-mech`} className="hover:text-foreground transition-colors">
          Catch Mech
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-medium text-foreground">Volunteer follow-up</span>
      </nav>

      <PageHeader
        title="Volunteer follow-up"
        description={`${respondedVolunteerIds.size} of ${totalVolunteers} confirmed volunteers responded`}
        actions={
          <FilterBar
            activeCount={activeCount}
            onClear={() => {
              setCommittee("all")
              setResponseState("all")
            }}
          >
            <FilterField label="Committee">
              <Select value={committee} onValueChange={setCommittee}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All committees</SelectItem>
                  {committees.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Response">
              <Select value={responseState} onValueChange={setResponseState}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All responses</SelectItem>
                  <SelectItem value="responded">Responded</SelectItem>
                  <SelectItem value="not-responded">No response</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>
        }
      />

      <section className="space-y-3">
        <h2 className="type-label text-muted-foreground">Responses</h2>
        <DataTable
          tableKey="event.catch-mech-volunteer-responses"
          rowLabel={{ one: "response", many: "responses" }}
          columns={submissionColumns}
          data={visibleSubmissions}
          emptyState={<p className="text-sm">No responses yet</p>}
          onRowClick={(submission) => {
            if (submission.decisions.length > 0) toggleRow(submission.id)
          }}
          renderSubRow={(submission) =>
            expanded.has(submission.id) && submission.decisions.length > 0 ? (
              <div className="bg-muted/30 p-3">
                <SubmissionDecisions
                  decisions={submission.decisions}
                  canViewMember={canViewMember}
                  canViewSmallGroup={canViewSmallGroup}
                />
              </div>
            ) : null
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="type-label text-muted-foreground">No response yet ({visibleNonResponders.length})</h2>
        <DataTable
          tableKey="event.catch-mech-volunteer-nonresponders"
          rowLabel={{ one: "volunteer", many: "volunteers" }}
          columns={nonResponderColumns}
          data={visibleNonResponders}
          emptyState={<p className="text-sm">Every matching volunteer has responded</p>}
          hidePagination
        />
      </section>
    </div>
  )
}
