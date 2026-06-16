"use client"

import { useRouter } from "next/navigation"
import { IconUsersGroup } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { buildColumns, type SmallGroupRow, RowActions } from "./columns"

function SmallGroupCard({ group, allIds }: { group: SmallGroupRow; allIds: string[] }) {
  const router = useRouter()
  const selection = useBatchSelection()
  const selecting = selection?.enabled && selection.selectMode
  const checked = selection?.isSelected(group.id) ?? false

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0 data-[selected=true]:border-primary"
      data-selected={checked}
      onClick={() => {
        if (selecting) {
          selection?.toggle(group.id)
          return
        }
        sessionStorage.setItem("smallGroupListIds", JSON.stringify(allIds))
        router.push(`/small-groups/${group.id}`)
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {selecting && (
            <Checkbox
              checked={checked}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => selection?.toggle(group.id)}
              aria-label={`Select ${group.name}`}
              className="mt-0.5"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium leading-tight">{group.name}</p>
                {group.status === "Pending" && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Pending
                  </span>
                )}
              </div>
              {!selecting && (
                <div onClick={(e) => e.stopPropagation()}>
                  <RowActions row={group} />
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Leader</span>
              <span>{group.leaderName ?? <span className="text-muted-foreground">No leader</span>}</span>
              <span className="text-muted-foreground">Parent Group</span>
              <span>{group.parentGroupName ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Members</span>
              <span>{group.memberCount}</span>
              <span className="text-muted-foreground">Life Stage</span>
              <span>{group.lifeStage ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Temp Members</span>
              <span>{group.tempMemberCount > 0 ? group.tempMemberCount : <span className="text-muted-foreground">—</span>}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SmallGroupsTable({
  groups,
  canWrite = false,
}: {
  groups: SmallGroupRow[]
  canWrite?: boolean
}) {
  const columns = buildColumns(canWrite)

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
          groups.map((group) => (
            <SmallGroupCard key={group.id} group={group} allIds={groups.map((g) => g.id)} />
          ))
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
