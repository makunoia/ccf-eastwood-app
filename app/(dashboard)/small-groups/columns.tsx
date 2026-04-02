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
import { deleteSmallGroup } from "./actions"
import { SmallGroupDialog } from "./small-group-dialog"

export type SmallGroupRow = {
  id: string
  name: string
  leaderName: string
  leaderId: string
  parentGroupId: string | null
  parentGroupName: string | null
  memberCount: number
  lifeStage: string | null
  lifeStageId: string | null
  language: string | null
  genderFocus: string | null
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  memberLimit: number | null
}

function RowActions({
  row,
  members,
  smallGroups,
  lifeStages,
}: {
  row: SmallGroupRow
  members: { id: string; firstName: string; lastName: string }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteSmallGroup(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Small group deleted")
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

      <SmallGroupDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        group={row}
        members={members}
        smallGroups={smallGroups}
        lifeStages={lifeStages}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete small group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{row.name}</span>? This action
              cannot be undone.
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

export function buildColumns(
  members: { id: string; firstName: string; lastName: string }[],
  smallGroups: { id: string; name: string }[],
  lifeStages: { id: string; name: string }[]
): ColumnDef<SmallGroupRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "leaderName",
      header: "Leader",
    },
    {
      accessorKey: "parentGroupName",
      header: "Parent Group",
      cell: ({ row }) =>
        row.original.parentGroupName ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "memberCount",
      header: "Members",
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
      accessorKey: "language",
      header: "Language",
      cell: ({ row }) =>
        row.original.language ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <RowActions
          row={row.original}
          members={members}
          smallGroups={smallGroups}
          lifeStages={lifeStages}
        />
      ),
    },
  ]
}
