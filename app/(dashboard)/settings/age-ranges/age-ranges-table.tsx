"use client"

import { DataTable } from "@/components/ui/data-table"
import { IconNumbers } from "@tabler/icons-react"
import { columns, type AgeRangeRow } from "./columns"

export function AgeRangesTable({ buckets }: { buckets: AgeRangeRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={buckets}
      emptyState={
        <>
          <IconNumbers className="size-8" />
          <p className="text-sm">No age ranges yet</p>
        </>
      }
    />
  )
}
