"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconPlus, IconUsers } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"

type Member = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  mobileNumber: string | null
  smallGroup: string | null
  lifeStage: string | null
  dateJoined: string
}

const columns: ColumnDef<Member>[] = [
  {
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    id: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "mobileNumber",
    header: "Mobile",
  },
  {
    accessorKey: "smallGroup",
    header: "Small Group",
  },
  {
    accessorKey: "lifeStage",
    header: "Life Stage",
  },
  {
    accessorKey: "dateJoined",
    header: "Date Joined",
  },
]

export default function MembersPage() {
  const data: Member[] = []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">Manage church member records</p>
        </div>
        <Button>
          <IconPlus />
          Add Member
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        emptyState={
          <>
            <IconUsers className="size-8" />
            <p className="text-sm">No members yet</p>
          </>
        }
      />
    </div>
  )
}
