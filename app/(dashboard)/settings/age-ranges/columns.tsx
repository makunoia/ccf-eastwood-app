"use client"

import * as React from "react"
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
import { formatAgeRange } from "@/lib/validations/age-range-bucket"
import { deleteAgeRangeBucket } from "./actions"
import { AgeRangeDialog } from "./age-range-dialog"

export type AgeRangeRow = {
  id: string
  label: string
  minAge: number | null
  maxAge: number | null
  order: number
}

function RowActions({ row }: { row: AgeRangeRow }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteAgeRangeBucket(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Age range deleted")
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
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
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

      <AgeRangeDialog open={editOpen} onOpenChange={setEditOpen} bucket={row} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete age range</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{row.label}</span>? Anyone who selected it
              keeps their record — the age range is simply cleared. This action cannot be
              undone.
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

export const columns: ColumnDef<AgeRangeRow>[] = [
  {
    accessorKey: "order",
    header: "Order",
  },
  {
    accessorKey: "label",
    header: "Label",
    cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
  },
  {
    id: "range",
    header: "Ages",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatAgeRange(row.original.minAge, row.original.maxAge)}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <RowActions row={row.original} />,
  },
]
