"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconEye, IconUserCheck } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildSelectionColumn } from "@/components/batch/selection-column"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"
import { PromoteGuestDialog } from "./promote-guest-dialog"

export type GuestRow = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  lifeStage: string | null
  eventCount: number
  dateAdded: string
  // Extra fields used by Export — not displayed in the table
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  notes: string | null
}

function RowActions({ row }: { row: GuestRow }) {
  const router = useRouter()
  const [promoteOpen, setPromoteOpen] = React.useState(false)
  const preferredFirstName = row.nickname?.trim() || row.firstName

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <span className="sr-only">Open menu</span>
            <IconDots className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => router.push(`/guests/${row.id}`)}>
            <IconEye className="mr-2 size-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPromoteOpen(true)}>
            <IconUserCheck className="mr-2 size-4" />
            Promote to member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PromoteGuestDialog
        guestId={row.id}
        guestName={`${preferredFirstName} ${row.lastName}`}
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        // The list only shows un-promoted guests, so the row leaves on success.
        onPromoted={() => router.refresh()}
      />
    </>
  )
}

export function buildColumns({
  selectable = false,
  canWrite = false,
}: { selectable?: boolean; canWrite?: boolean } = {}): ColumnDef<GuestRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<GuestRow>()] : []),
    {
      accessorFn: (row) => `${row.nickname?.trim() || row.firstName} ${row.lastName}`,
      id: "name",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row, table }) => {
        const ids = table.getRowModel().rows.map((r) => (r.original as GuestRow).id)
        const preferredFirstName = row.original.nickname?.trim() || row.original.firstName
        return (
          <Link
            href={`/guests/${row.original.id}`}
            onClick={() => sessionStorage.setItem("guestListIds", JSON.stringify(ids))}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {preferredFirstName} {row.original.lastName}
          </Link>
        )
      },
    },
    emailColumn<GuestRow>((row) => row.email),
    phoneColumn<GuestRow>((row) => row.phone),
    {
      accessorKey: "eventCount",
      header: "Events",
      meta: { label: "Events", width: "narrow", align: "right" },
    },
    {
      accessorKey: "lifeStage",
      header: "Life Stage",
      meta: { label: "Life Stage", width: "status" },
      cell: ({ row }) => row.original.lifeStage ?? <GuestBlank />,
    },
    {
      accessorKey: "dateAdded",
      header: "Date Added",
      meta: { label: "Date Added", width: "date" },
      cell: ({ row }) =>
        new Date(row.original.dateAdded).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
    },

    // Already carried on the row for the CSV export; now offered on screen too,
    // off by default, under the picker's "More columns".
    {
      accessorKey: "gender",
      header: "Gender",
      meta: { label: "Gender", width: "narrow", optIn: true },
      cell: ({ row }) => row.original.gender ?? <GuestBlank />,
    },
    {
      id: "language",
      accessorFn: (row) => row.language.join(", "),
      header: "Language",
      meta: { label: "Language", width: "text", optIn: true },
      cell: ({ row }) =>
        row.original.language.length > 0 ? row.original.language.join(", ") : <GuestBlank />,
    },
    {
      accessorKey: "workCity",
      header: "Work City",
      meta: { label: "Work City", width: "text", optIn: true },
      cell: ({ row }) => row.original.workCity ?? <GuestBlank />,
    },
    {
      accessorKey: "workIndustry",
      header: "Industry",
      meta: { label: "Industry", width: "text", optIn: true },
      cell: ({ row }) => row.original.workIndustry ?? <GuestBlank />,
    },
    {
      accessorKey: "meetingPreference",
      header: "Meets",
      meta: { label: "Meeting Preference", width: "status", optIn: true },
      cell: ({ row }) => row.original.meetingPreference ?? <GuestBlank />,
    },
    {
      accessorKey: "birthYear",
      header: "Birth Year",
      meta: { label: "Birth Year", width: "narrow", optIn: true },
      cell: ({ row }) => row.original.birthYear ?? <GuestBlank />,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      meta: { label: "Notes", width: "wide", optIn: true },
      cell: ({ row }) => row.original.notes ?? <GuestBlank />,
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            meta: { width: "actions", locked: true },
            cell: ({ row }) => <RowActions row={row.original} />,
          } satisfies ColumnDef<GuestRow>,
        ]
      : []),
  ]
}

function GuestBlank() {
  return <span className="text-muted-foreground">—</span>
}
