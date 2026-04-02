"use client"

import { IconUsersGroup } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { buildColumns, type SmallGroupRow } from "./columns"

export function SmallGroupsTable({ groups }: { groups: SmallGroupRow[] }) {
  const columns = buildColumns()

  return (
    <DataTable
      columns={columns}
      data={groups}
      emptyState={
        <>
          <IconUsersGroup className="size-8" />
          <p className="text-sm">No small groups yet</p>
        </>
      }
    />
  )
}
