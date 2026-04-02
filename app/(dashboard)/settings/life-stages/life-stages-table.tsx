"use client"

import { DataTable } from "@/components/ui/data-table"
import { IconCategory } from "@tabler/icons-react"
import { columns, type LifeStageRow } from "./columns"

export function LifeStagesTable({ lifeStages }: { lifeStages: LifeStageRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={lifeStages}
      emptyState={
        <>
          <IconCategory className="size-8" />
          <p className="text-sm">No life stages yet</p>
        </>
      }
    />
  )
}
