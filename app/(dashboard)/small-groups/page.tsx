"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconPlus, IconUsersGroup } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"

type SmallGroup = {
  id: string
  name: string
  leader: string
  parentGroup: string | null
  memberCount: number
  lifeStage: string | null
  language: string | null
}

const columns: ColumnDef<SmallGroup>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "leader",
    header: "Leader",
  },
  {
    accessorKey: "parentGroup",
    header: "Parent Group",
  },
  {
    accessorKey: "memberCount",
    header: "Members",
  },
  {
    accessorKey: "lifeStage",
    header: "Life Stage",
  },
  {
    accessorKey: "language",
    header: "Language",
  },
]

export default function SmallGroupsPage() {
  const data: SmallGroup[] = []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Small Groups</h2>
          <p className="text-sm text-muted-foreground">Manage fellowship groups and their hierarchy</p>
        </div>
        <Button>
          <IconPlus />
          Add Group
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        emptyState={
          <>
            <IconUsersGroup className="size-8" />
            <p className="text-sm">No small groups yet</p>
          </>
        }
      />
    </div>
  )
}
