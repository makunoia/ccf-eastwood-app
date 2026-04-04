"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconBuilding, IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"

type Ministry = {
  id: string
  name: string
  lifeStage: string
  description: string | null
  volunteerCount: number
  eventCount: number
}

const columns: ColumnDef<Ministry>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "lifeStage",
    header: "Life Stage",
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "volunteerCount",
    header: "Volunteers",
  },
  {
    accessorKey: "eventCount",
    header: "Events",
  },
]

function MinistryCard({ ministry }: { ministry: Ministry }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="font-medium leading-tight">{ministry.name}</p>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Life Stage</span>
          <span>{ministry.lifeStage}</span>
          <span className="text-muted-foreground">Description</span>
          <span>{ministry.description ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Volunteers</span>
          <span>{ministry.volunteerCount}</span>
          <span className="text-muted-foreground">Events</span>
          <span>{ministry.eventCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MinistriesPage() {
  const data: Ministry[] = []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ministries</h2>
          <p className="text-sm text-muted-foreground">Manage church ministry departments</p>
        </div>
        <Button>
          <IconPlus />
          Add Ministry
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconBuilding className="size-8" />
            <p className="text-sm">No ministries yet</p>
          </div>
        ) : (
          data.map((ministry) => <MinistryCard key={ministry.id} ministry={ministry} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          emptyState={
            <>
              <IconBuilding className="size-8" />
              <p className="text-sm">No ministries yet</p>
            </>
          }
        />
      </div>
    </div>
  )
}
