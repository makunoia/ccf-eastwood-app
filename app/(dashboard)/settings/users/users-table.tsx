"use client"

import { DataTable } from "@/components/ui/data-table"
import { IconUsers } from "@tabler/icons-react"
import { buildColumns, type UserRow, type EventOption } from "./columns"

export function UsersTable({ users, events }: { users: UserRow[]; events: EventOption[] }) {
  const columns = buildColumns(events)
  return (
    <DataTable
      columns={columns}
      data={users}
      emptyState={
        <>
          <IconUsers className="size-8" />
          <p className="text-sm">No users yet</p>
        </>
      }
    />
  )
}
