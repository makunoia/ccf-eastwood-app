"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconHeart, IconPlus } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"

type Volunteer = {
  id: string
  member: string
  scope: string
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

const columns: ColumnDef<Volunteer>[] = [
  {
    accessorKey: "member",
    header: "Member",
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
    cell: ({ row }) => row.original.assignedRole ?? <span className="text-muted-foreground">—</span>,
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
]

export default function VolunteersPage() {
  const data: Volunteer[] = []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Volunteers</h2>
          <p className="text-sm text-muted-foreground">Manage volunteer registrations and role assignments</p>
        </div>
        <Button>
          <IconPlus />
          Add Volunteer
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        emptyState={
          <>
            <IconHeart className="size-8" />
            <p className="text-sm">No volunteers yet</p>
          </>
        }
      />
    </div>
  )
}
