"use client"

import { DataTable } from "@/components/ui/data-table"
import { IconListCheck } from "@tabler/icons-react"
import { columns, type SmallGroupStatusRow } from "./columns"

export function SmallGroupStatusesTable({ statuses }: { statuses: SmallGroupStatusRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={statuses}
      emptyState={
        <>
          <IconListCheck className="size-8" />
          <p className="text-sm">No statuses yet</p>
        </>
      }
    />
  )
}
