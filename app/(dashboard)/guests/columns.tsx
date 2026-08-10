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
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) =>
        row.original.email ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "phone",
      header: "Mobile",
      cell: ({ row }) =>
        row.original.phone ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "eventCount",
      header: "Events",
    },
    {
      accessorKey: "lifeStage",
      header: "Life Stage",
      cell: ({ row }) =>
        row.original.lifeStage ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "dateAdded",
      header: "Date Added",
      cell: ({ row }) =>
        new Date(row.original.dateAdded).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            cell: ({ row }) => <RowActions row={row.original} />,
          } satisfies ColumnDef<GuestRow>,
        ]
      : []),
  ]
}
