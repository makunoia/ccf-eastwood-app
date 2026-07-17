"use client"

import * as React from "react"
import Link from "next/link"
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
import { deleteFamily } from "./actions"
import { FamilyFormDialog } from "./family-form-dialog"

export type FamilyRow = {
  id: string
  name: string
  notes: string | null
  parents: string
  childCount: number
  memberCount: number
}

export function RowActions({ row }: { row: FamilyRow }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteFamily(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Family deleted")
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

      <FamilyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        family={{ id: row.id, name: row.name, notes: row.notes }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete family</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{row.name}</span>? Its members and
              guests are kept — only the family grouping is removed. This action
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

export function buildColumns(canWrite: boolean): ColumnDef<FamilyRow>[] {
  const columns: ColumnDef<FamilyRow>[] = [
    {
      accessorKey: "name",
      header: "Family",
      cell: ({ row }) => (
        <Link
          href={`/families/${row.original.id}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "parents",
      header: "Parents",
      cell: ({ row }) =>
        row.original.parents || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "childCount",
      header: "Children",
    },
    {
      accessorKey: "memberCount",
      header: "Total",
    },
  ]
  if (canWrite) {
    columns.push({
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} />,
    })
  }
  return columns
}
