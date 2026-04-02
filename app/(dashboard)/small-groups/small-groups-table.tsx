"use client"

import { IconUsersGroup } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { buildColumns, type SmallGroupRow } from "./columns"

export function SmallGroupsTable({
  groups,
  members,
  smallGroups,
  lifeStages,
}: {
  groups: SmallGroupRow[]
  members: { id: string; firstName: string; lastName: string }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
}) {
  const columns = buildColumns(members, smallGroups, lifeStages)

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
