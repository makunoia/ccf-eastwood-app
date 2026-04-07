"use client"

import { useRouter } from "next/navigation"
import { IconHeart } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import { buildColumns, type VolunteerRow, RowActions } from "./columns"

const STATUS_VARIANT = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
} as const

function VolunteerCard({ volunteer }: { volunteer: VolunteerRow }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/volunteers/${volunteer.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{volunteer.memberName}</p>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge variant={STATUS_VARIANT[volunteer.status]}>{volunteer.status}</Badge>
            <RowActions row={volunteer} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Ministry / Event</span>
          <span>{volunteer.scope}</span>
          <span className="text-muted-foreground">Committee</span>
          <span>{volunteer.committee}</span>
          <span className="text-muted-foreground">Preferred Role</span>
          <span>{volunteer.preferredRole}</span>
          <span className="text-muted-foreground">Assigned Role</span>
          <span>
            {volunteer.assignedRole ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function VolunteersTable({ volunteers }: { volunteers: VolunteerRow[] }) {
  const columns = buildColumns()

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {volunteers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconHeart className="size-8" />
            <p className="text-sm">No volunteers yet</p>
          </div>
        ) : (
          volunteers.map((v) => <VolunteerCard key={v.id} volunteer={v} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={volunteers}
          emptyState={
            <>
              <IconHeart className="size-8" />
              <p className="text-sm">No volunteers yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
