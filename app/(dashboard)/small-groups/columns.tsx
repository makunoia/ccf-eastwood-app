"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CouplesBadge } from "@/components/group-type-badge"
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
import { deleteSmallGroup } from "./actions"

export type SmallGroupRow = {
  id: string
  name: string
  status: "Active" | "Pending" | "Inactive"
  groupType: "Regular" | "Couples"
  leaderName: string | null
  leaderId: string | null
  // Extra fields used by Export — not displayed in the table
  leaderFirstName: string
  leaderLastName: string
  leaderEmail: string | null
  leaderPhone: string | null
  parentGroupId: string | null
  parentGroupName: string | null
  memberCount: number
  tempMemberCount: number
  lifeStages: { id: string; name: string }[]
  language: string[]
  genderFocus: string | null
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  memberLimit: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
}

export function RowActions({ row }: { row: SmallGroupRow }) {
  const router = useRouter()
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
          <DropdownMenuItem
            onSelect={() => router.push(`/small-groups/${row.id}`)}
          >
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

export function buildColumns(selectable = false): ColumnDef<SmallGroupRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<SmallGroupRow>()] : []),
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row, table }) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/small-groups/${row.original.id}`}
            onClick={() =>
              sessionStorage.setItem(
                "smallGroupListIds",
                JSON.stringify(table.getRowModel().rows.map((r) => (r.original as SmallGroupRow).id)),
              )
            }
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {row.original.name}
          </Link>
          {row.original.groupType === "Couples" && <CouplesBadge />}
          {row.original.status === "Pending" && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Pending
            </span>
          )}
          {row.original.status === "Inactive" && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Inactive
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "leaderName",
      header: "Leader",
      cell: ({ row }) =>
        row.original.leaderName ?? (
          <span className="text-muted-foreground">No leader</span>
        ),
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
      id: "lifeStage",
      accessorFn: (row) => row.lifeStages.map((ls) => ls.name).join(", "),
      header: "Life Stage",
      cell: ({ row }) =>
        row.original.lifeStages.length > 0 ? (
          row.original.lifeStages.map((ls) => ls.name).join(", ")
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "tempMemberCount",
      header: "Temp Members",
      cell: ({ row }) =>
        row.original.tempMemberCount > 0 ? (
          row.original.tempMemberCount
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} />,
    },
  ]
}
