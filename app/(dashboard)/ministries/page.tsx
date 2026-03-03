"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconBuilding, IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
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
  )
}
