"use client"

import { useRouter } from "next/navigation"
import { IconUsers } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { buildColumns, type MemberRow, RowActions } from "./columns"

function MemberCard({ member, allIds }: { member: MemberRow; allIds: string[] }) {
  const router = useRouter()
  const selection = useBatchSelection()
  const selecting = selection?.enabled && selection.selectMode
  const checked = selection?.isSelected(member.id) ?? false

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0 data-[selected=true]:border-primary"
      data-selected={checked}
      onClick={() => {
        if (selecting) {
          selection?.toggle(member.id)
          return
        }
        sessionStorage.setItem("memberListIds", JSON.stringify(allIds))
        router.push(`/members/${member.id}`)
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {selecting && (
            <Checkbox
              checked={checked}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => selection?.toggle(member.id)}
              aria-label={`Select ${member.firstName} ${member.lastName}`}
              className="mt-0.5"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-tight">
                {member.firstName} {member.lastName}
              </p>
              {!selecting && (
                <div onClick={(e) => e.stopPropagation()}>
                  <RowActions row={member} />
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{member.email ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Mobile</span>
              <span>{member.phone ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">DGroup</span>
              <span>{member.smallGroupName ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Life Stage</span>
              <span>{member.lifeStage ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Date Joined</span>
              <span>
                {new Date(member.dateJoined).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function MembersTable({
  members,
  canWrite = false,
}: {
  members: MemberRow[]
  canWrite?: boolean
}) {
  const columns = buildColumns(canWrite)

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconUsers className="size-8" />
            <p className="text-sm">No members yet</p>
          </div>
        ) : (
          members.map((member) => (
            <MemberCard key={member.id} member={member} allIds={members.map((m) => m.id)} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          columns={columns}
          data={members}
          emptyState={
            <>
              <IconUsers className="size-8" />
              <p className="text-sm">No members yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
