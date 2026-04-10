"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconPencil, IconTrash, IconShieldCheck, IconShield } from "@tabler/icons-react"
import { toast } from "sonner"
import type { FeatureArea } from "@/app/generated/prisma/client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { deleteUser } from "./actions"
import { UserDialog } from "./user-dialog"

export type UserRow = {
  id: string
  name: string | null
  email: string
  role: "SuperAdmin" | "Staff"
  permissions: FeatureArea[]
  eventAccess: string[]
  totpEnabled: boolean
  mustChangePassword: boolean
  requiresTotpSetup: boolean
  createdAt: Date
}

export type EventOption = { id: string; name: string }

function StatusBadge({ user }: { user: UserRow }) {
  if (user.requiresTotpSetup) {
    return <Badge variant="secondary">Pending setup</Badge>
  }
  if (user.mustChangePassword) {
    return <Badge variant="secondary">Password reset required</Badge>
  }
  return <Badge variant="default">Active</Badge>
}

function RowActions({ row, events }: { row: UserRow; events: EventOption[] }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  if (row.role === "SuperAdmin") {
    return null // Cannot edit or delete the Super Admin via this UI
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteUser(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("User deleted")
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
            Edit permissions
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

      <UserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={row}
        events={events}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{row.name ?? row.email}</span>? This action
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

export function buildColumns(events: EventOption[]): ColumnDef<UserRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) =>
        row.original.role === "SuperAdmin" ? (
          <div className="flex items-center gap-1.5 text-sm">
            <IconShieldCheck className="size-4 text-primary" />
            Super Admin
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <IconShield className="size-4" />
            Staff
          </div>
        ),
    },
    {
      id: "access",
      header: "Feature access",
      cell: ({ row }) => {
        if (row.original.role === "SuperAdmin") {
          return <span className="text-sm text-muted-foreground">All features</span>
        }
        if (row.original.permissions.length === 0) {
          return <span className="text-sm text-muted-foreground">No access</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {row.original.permissions.map((p) => (
              <Badge key={p} variant="outline" className="text-xs">
                {p === "SmallGroups" ? "Small Groups" : p}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge user={row.original} />,
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} events={events} />,
    },
  ]
}
