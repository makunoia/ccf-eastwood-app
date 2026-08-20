"use client"

import Link from "next/link"
import { type ColumnDef } from "@tanstack/react-table"
import { IconCheck, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildSelectionColumn } from "@/components/batch/selection-column"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"

/**
 * The registrant table's columns.
 *
 * Split out of `registrants-client.tsx` (which hand-rolled its own `<table>`)
 * so this screen sizes its columns from the same vocabulary as every other
 * list, and gets the column picker for free.
 *
 * Note that Contact is now two separate columns, Email and Mobile, rather than
 * one cell showing `mobile ?? email`. The merged version silently hid whichever
 * one it didn't pick, and there was no way to ask for the other; two columns
 * that an admin can switch off individually is strictly more useful, and it
 * matches how Members and Guests have always presented the same two facts.
 */

export type RegistrantRow = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string | null
  mobileNumber: string | null
  isPaid: boolean
  paymentReference: string | null
  attendedAt: string | null
  createdAt: string
  member: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
  guest: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
}

export function registrantName(r: RegistrantRow) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || null
}

export function registrantMobile(r: RegistrantRow) {
  if (r.member) return r.member.phone
  if (r.guest) return r.guest.phone
  return r.mobileNumber
}

export function registrantEmail(r: RegistrantRow) {
  if (r.member) return r.member.email
  if (r.guest) return r.guest.email
  return r.email
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function buildRegistrantColumns({
  eventId,
  selectable,
  isRecurringOrMultiDay,
  isPaidEvent,
  onSaveIds,
  onMarkPaid,
}: {
  eventId: string
  selectable: boolean
  isRecurringOrMultiDay: boolean
  isPaidEvent: boolean
  onSaveIds: () => void
  onMarkPaid: (registrantId: string) => void
}): ColumnDef<RegistrantRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<RegistrantRow>()] : []),
    {
      id: "name",
      accessorFn: (row) => registrantName(row) ?? "",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/registrants/${row.original.id}`}
          onClick={onSaveIds}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {registrantName(row.original) ?? (
            <span className="text-muted-foreground italic">No name</span>
          )}
        </Link>
      ),
    },
    phoneColumn<RegistrantRow>(registrantMobile),
    emailColumn<RegistrantRow>(registrantEmail),
    {
      id: "type",
      accessorFn: (row) => (row.memberId ? "Member" : "Guest"),
      header: "Type",
      meta: { label: "Type", width: "narrow" },
      cell: ({ row }) =>
        row.original.memberId ? (
          <Badge variant="secondary">Member</Badge>
        ) : (
          <Badge variant="outline">Guest</Badge>
        ),
    },

    // Payment only exists on a priced, non-session event; a session event
    // tracks attendance per occurrence instead and never collects money.
    ...(!isRecurringOrMultiDay && isPaidEvent
      ? [
          {
            id: "payment",
            accessorFn: (row: RegistrantRow) => (row.isPaid ? 1 : 0),
            header: "Payment",
            meta: { label: "Payment", width: "status" },
            cell: ({ row }) =>
              row.original.isPaid ? (
                <div className="flex items-center gap-1.5">
                  <IconCheck className="size-4 shrink-0 text-green-600" />
                  <span className="truncate text-xs text-muted-foreground">
                    {row.original.paymentReference}
                  </span>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onMarkPaid(row.original.id)}>
                  Mark paid
                </Button>
              ),
          } satisfies ColumnDef<RegistrantRow>,
        ]
      : []),

    isRecurringOrMultiDay
      ? {
          accessorKey: "createdAt",
          header: "Registered",
          meta: { label: "Registered", width: "date" },
          cell: ({ row }) => (
            <span className="text-muted-foreground">{formatDay(row.original.createdAt)}</span>
          ),
        }
      : {
          id: "attended",
          accessorFn: (row: RegistrantRow) => (row.attendedAt ? 1 : 0),
          header: "Attended",
          meta: { label: "Attended", width: "status" },
          cell: ({ row }) =>
            row.original.attendedAt ? (
              <Badge className="border-transparent bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                <IconCheck className="mr-1 size-3.5" />
                Attended
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <IconX className="mr-1 size-3.5" />
                Absent
              </Badge>
            ),
        },
  ]
}
