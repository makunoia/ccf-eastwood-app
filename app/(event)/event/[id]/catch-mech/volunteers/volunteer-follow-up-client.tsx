"use client"

import * as React from "react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Volunteer</TableHead>
                <TableHead>Committee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Placed</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No responses yet
                  </TableCell>
                </TableRow>
              ) : visibleSubmissions.map((submission) => {
                const isOpen = expanded.has(submission.id)
                // A submission from before this trail existed has counts but no
                // stored names, so the expander is driven by what we can show.
                const canExpand = submission.decisions.length > 0
                return (
                  <React.Fragment key={submission.id}>
                    <TableRow
                      data-state={isOpen ? "open" : undefined}
                      className={canExpand ? "cursor-pointer" : undefined}
                      onClick={canExpand ? () => toggleRow(submission.id) : undefined}
                    >
                      <TableCell className="pr-0">
                        {canExpand && (
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen
                                ? `Hide the people ${submission.volunteerName} reported`
                                : `Show the people ${submission.volunteerName} reported`
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleRow(submission.id)
                            }}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronRight
                              className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{submission.volunteerName}</TableCell>
                      <TableCell>{submission.committeeName}</TableCell>
                      <TableCell>{submission.roleName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {submission.placedCount === 0 ? (
                          <Badge variant="secondary">None</Badge>
                        ) : submission.placedCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(submission.createdAt)}</TableCell>
                    </TableRow>
                    {isOpen && canExpand && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 p-3">
                          <SubmissionDecisions
                            decisions={submission.decisions}
                            canViewMember={canViewMember}
                            canViewSmallGroup={canViewSmallGroup}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="type-label text-muted-foreground">No response yet ({visibleNonResponders.length})</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Volunteer</TableHead>
                <TableHead>Committee</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleNonResponders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Every matching volunteer has responded
                  </TableCell>
                </TableRow>
              ) : visibleNonResponders.map((volunteer) => (
                <TableRow key={volunteer.id}>
                  <TableCell className="font-medium">{volunteer.volunteerName}</TableCell>
                  <TableCell>{volunteer.committeeName}</TableCell>
                  <TableCell>{volunteer.roleName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
