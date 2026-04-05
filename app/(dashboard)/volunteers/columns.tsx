"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { deleteVolunteer } from "./actions"

export type VolunteerRow = {
  id: string
  memberName: string
  scope: string        // "Ministry: Elevate" or "Event: Camp 2025"
  committee: string
  preferredRole: string
  assignedRole: string | null
  status: "Pending" | "Confirmed" | "Rejected"
}

const STATUS_VARIANT = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
} as const

export function RowActions({ row }: { row: VolunteerRow }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteVolunteer(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Volunteer deleted")
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
          <DropdownMenuItem onSelect={() => router.push(`/volunteers/${row.id}`)}>
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
            <DialogTitle>Delete volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{row.memberName}</span> as a volunteer? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function buildColumns(): ColumnDef<VolunteerRow>[] {
  return [
    {
      accessorKey: "memberName",
      header: "Member",
      cell: ({ row }) => (
        <Link
          href={`/volunteers/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.memberName}
        </Link>
      ),
    },
    {
      accessorKey: "scope",
      header: "Ministry / Event",
    },
    {
      accessorKey: "committee",
      header: "Committee",
    },
    {
      accessorKey: "preferredRole",
      header: "Preferred Role",
    },
    {
      accessorKey: "assignedRole",
      header: "Assigned Role",
      cell: ({ row }) =>
        row.original.assignedRole ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} />,
    },
  ]
}
