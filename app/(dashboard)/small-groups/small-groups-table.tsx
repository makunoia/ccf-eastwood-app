"use client"

import { useRouter } from "next/navigation"
import { IconUsersGroup } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type SmallGroupRow, RowActions } from "./columns"

function SmallGroupCard({ group }: { group: SmallGroupRow }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/small-groups/${group.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{group.name}</p>
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions row={group} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Leader</span>
          <span>{group.leaderName}</span>
          <span className="text-muted-foreground">Parent Group</span>
          <span>{group.parentGroupName ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Members</span>
          <span>{group.memberCount}</span>
          <span className="text-muted-foreground">Life Stage</span>
          <span>{group.lifeStage ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Language</span>
          <span>{group.language.length > 0 ? group.language.join(", ") : <span className="text-muted-foreground">—</span>}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function SmallGroupsTable({ groups }: { groups: SmallGroupRow[] }) {
  const columns = buildColumns()

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconUsersGroup className="size-8" />
            <p className="text-sm">No small groups yet</p>
          </div>
        ) : (
          groups.map((group) => <SmallGroupCard key={group.id} group={group} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
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
      </div>
    </>
  )
}
