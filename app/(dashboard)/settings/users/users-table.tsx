"use client"

import * as React from "react"
import { DataTable } from "@/components/ui/data-table"
import { IconUsers } from "@tabler/icons-react"
import { buildColumns, type UserRow, type EventOption } from "./columns"
import { UserDetailSheet } from "./user-detail-sheet"

export function UsersTable({ users, events }: { users: UserRow[]; events: EventOption[] }) {
  const [selectedUser, setSelectedUser] = React.useState<UserRow | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  function handleViewUser(user: UserRow) {
    setSelectedUser(user)
    setSheetOpen(true)
  }

  const columns = buildColumns(events, handleViewUser)

  return (
    <>
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
      <UserDetailSheet
        user={selectedUser}
        events={events}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  )
}
