"use client"

import { useRouter } from "next/navigation"
import { IconBuilding } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type MinistryRow, RowActions } from "./columns"

function MinistryCard({ ministry }: { ministry: MinistryRow }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/ministries/${ministry.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{ministry.name}</p>
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions row={ministry} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Life Stage</span>
          <span>
            {ministry.lifeStage ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          <span className="text-muted-foreground">Description</span>
          <span>
            {ministry.description ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          <span className="text-muted-foreground">Volunteers</span>
          <span>{ministry.volunteerCount}</span>
          <span className="text-muted-foreground">Events</span>
          <span>{ministry.eventCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function MinistriesTable({ ministries }: { ministries: MinistryRow[] }) {
  const columns = buildColumns()

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {ministries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconBuilding className="size-8" />
            <p className="text-sm">No ministries yet</p>
          </div>
        ) : (
          ministries.map((ministry) => (
            <MinistryCard key={ministry.id} ministry={ministry} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          columns={columns}
          data={ministries}
          emptyState={
            <>
              <IconBuilding className="size-8" />
              <p className="text-sm">No ministries yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
