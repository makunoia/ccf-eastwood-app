"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconHeart, IconPlus } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

function VolunteerCard({ volunteer }: { volunteer: Volunteer }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{volunteer.member}</p>
          <Badge variant={STATUS_VARIANT[volunteer.status]}>{volunteer.status}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Ministry / Event</span>
          <span>{volunteer.scope}</span>
          <span className="text-muted-foreground">Committee</span>
          <span>{volunteer.committee}</span>
          <span className="text-muted-foreground">Preferred Role</span>
          <span>{volunteer.preferredRole}</span>
          <span className="text-muted-foreground">Assigned Role</span>
          <span>{volunteer.assignedRole ?? <span className="text-muted-foreground">—</span>}</span>
        </div>
      </CardContent>
    </Card>
  )
}

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

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconHeart className="size-8" />
            <p className="text-sm">No volunteers yet</p>
          </div>
        ) : (
          data.map((volunteer) => <VolunteerCard key={volunteer.id} volunteer={volunteer} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
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
    </div>
  )
}
