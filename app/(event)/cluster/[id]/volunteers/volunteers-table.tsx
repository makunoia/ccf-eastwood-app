"use client"

import * as React from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { VolunteerStatus } from "@/app/generated/prisma/client"

export type ClusterVolunteerRow = {
  id: string
  status: VolunteerStatus
  notes: string | null
  member: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
  }
  event: { id: string; name: string }
  committee: { id: string; name: string }
  preferredRole: { id: string; name: string }
  assignedRole: { id: string; name: string } | null
  /** Serving on more than one of the day's events. */
  servingInBoth: boolean
}

const STATUS_VARIANT: Record<VolunteerStatus, "default" | "secondary" | "destructive"> = {
  Confirmed: "default",
  Pending: "secondary",
  Rejected: "destructive",
}

/**
 * The day's serving team, one row per volunteer sign-up.
 *
 * Grouped visually by nothing and sorted by event, because the question this page
 * answers is "who is serving today" — an admin scanning for a name should not have
 * to know which ministry they came in through. The Event column carries that when
 * it matters.
 *
 * Read-and-navigate rather than edit-in-place: a volunteer belongs to their event,
 * so their detail page — where status, committee and role are changed — lives in
 * that event's workspace. Linking there keeps one owner for those writes instead of
 * a second set of controls that would have to stay in step.
 */
export function ClusterVolunteersTable({
  rows,
  committees,
  events,
  canEdit,
  scope,
  formIsOpen,
}: {
  rows: ClusterVolunteerRow[]
  committees: { id: string; name: string; eventId: string }[]
  events: { id: string; name: string }[]
  canEdit: boolean
  /** Which list this is — the day's own sign-ups, or both standing rosters. */
  scope: "day" | "all"
  /** Whether the day's volunteer form is currently accepting sign-ups. */
  formIsOpen: boolean
}) {
  const showEventColumn = events.length > 1

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">
          {scope === "day" ? "No sign-ups for this day yet" : "No volunteers yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope === "day" ? (
            <>
              This list fills up as people sign up through the day&apos;s volunteer
              form.{" "}
              {formIsOpen
                ? "Share the link from Forms → Volunteer Sign-Up."
                : "Open it under Forms → Volunteer Sign-Up to start recruiting."}
            </>
          ) : (
            <>
              Nobody has volunteered on either of the day&apos;s events yet.
              Everyone confirmed across them can run any of its breakout tables.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {showEventColumn && <TableHead>Signed up under</TableHead>}
              <TableHead>Committee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <Link
                        href={`/event/${v.event.id}/volunteers/${v.id}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {v.member.firstName} {v.member.lastName}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {v.member.firstName} {v.member.lastName}
                      </span>
                    )}
                    {v.servingInBoth && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Serving in both
                      </Badge>
                    )}
                  </div>
                  {v.member.phone && (
                    <p className="text-xs text-muted-foreground">{v.member.phone}</p>
                  )}
                </TableCell>
                {showEventColumn && (
                  <TableCell className="text-sm text-muted-foreground">
                    {v.event.name}
                  </TableCell>
                )}
                <TableCell className="text-sm">{v.committee.name}</TableCell>
                <TableCell className="text-sm">
                  {v.assignedRole?.name ?? (
                    <span className="text-muted-foreground">
                      {v.preferredRole.name} <span className="text-xs">(preferred)</span>
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[v.status]}>{v.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {committees.length === 0 && (
        <p className="border-t p-4 text-sm text-muted-foreground">
          No committees are set up on the day&apos;s events yet.
        </p>
      )}
    </div>
  )
}
