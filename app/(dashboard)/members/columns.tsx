"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { buildSelectionColumn } from "@/components/batch/selection-column"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"
import { deleteMember } from "./actions"

export type MemberRow = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  smallGroupName: string | null
  lifeStage: string | null
  dateJoined: string
  // For edit form pre-fill
  address: string | null
  notes: string | null
  lifeStageId: string | null
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  ageRangeBucketId: string | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  scheduleDayOfWeek?: number | null
  scheduleTimeStart?: string | null
  scheduleTimeEnd?: string | null
}

export function RowActions({ row }: { row: MemberRow }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteMember(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Member deleted")
      setDeleteOpen(false)
    } else {
      toast.error(result.error)
    }
  }

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
          <DropdownMenuItem onSelect={() => router.push(`/members/${row.id}`)}>
            <IconPencil className="mr-2 size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <IconTrash className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">
                {row.firstName} {row.lastName}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function buildColumns(selectable = false): ColumnDef<MemberRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<MemberRow>()] : []),
    {
      accessorFn: (row) => `${row.nickname?.trim() || row.firstName} ${row.lastName}`,
      id: "name",
      header: "Name",
      // Locked: the name cell is the only way into a member's detail page.
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row, table }) => {
        const ids = table.getRowModel().rows.map((r) => (r.original as MemberRow).id)
        const preferredFirstName = row.original.nickname?.trim() || row.original.firstName
        return (
          <Link
            href={`/members/${row.original.id}`}
            onClick={() => sessionStorage.setItem("memberListIds", JSON.stringify(ids))}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {preferredFirstName} {row.original.lastName}
          </Link>
        )
      },
    },
    emailColumn<MemberRow>((row) => row.email),
    phoneColumn<MemberRow>((row) => row.phone),
    {
      accessorKey: "smallGroupName",
      header: "DGroup",
      meta: { label: "DGroup", width: "name" },
      cell: ({ row }) => row.original.smallGroupName ?? <Blank />,
    },
    {
      accessorKey: "lifeStage",
      header: "Life Stage",
      meta: { label: "Life Stage", width: "status" },
      cell: ({ row }) => row.original.lifeStage ?? <Blank />,
    },
    {
      accessorKey: "dateJoined",
      header: "Date Joined",
      meta: { label: "Date Joined", width: "date" },
      cell: ({ row }) => formatDate(row.original.dateJoined),
    },

    // Facts the record already holds that most days nobody needs on screen.
    // Offered in the column picker under "More columns", off by default.
    {
      accessorKey: "gender",
      header: "Gender",
      meta: { label: "Gender", width: "narrow", optIn: true },
      cell: ({ row }) => row.original.gender ?? <Blank />,
    },
    {
      id: "language",
      accessorFn: (row) => row.language.join(", "),
      header: "Language",
      meta: { label: "Language", width: "text", optIn: true },
      cell: ({ row }) =>
        row.original.language.length > 0 ? row.original.language.join(", ") : <Blank />,
    },
    {
      accessorKey: "workCity",
      header: "Work City",
      meta: { label: "Work City", width: "text", optIn: true },
      cell: ({ row }) => row.original.workCity ?? <Blank />,
    },
    {
      accessorKey: "workIndustry",
      header: "Industry",
      meta: { label: "Industry", width: "text", optIn: true },
      cell: ({ row }) => row.original.workIndustry ?? <Blank />,
    },
    {
      accessorKey: "meetingPreference",
      header: "Meets",
      meta: { label: "Meeting Preference", width: "status", optIn: true },
      cell: ({ row }) => row.original.meetingPreference ?? <Blank />,
    },
    {
      accessorKey: "birthYear",
      header: "Birth Year",
      meta: { label: "Birth Year", width: "narrow", optIn: true },
      cell: ({ row }) => row.original.birthYear ?? <Blank />,
    },
    {
      accessorKey: "address",
      header: "Address",
      meta: { label: "Address", width: "wide", optIn: true },
      cell: ({ row }) => row.original.address ?? <Blank />,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      meta: { label: "Notes", width: "wide", optIn: true },
      cell: ({ row }) => row.original.notes ?? <Blank />,
    },
    {
      id: "actions",
      meta: { width: "actions", locked: true },
      cell: ({ row }) => <RowActions row={row.original} />,
    },
  ]
}

function Blank() {
  return <span className="text-muted-foreground">—</span>
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
