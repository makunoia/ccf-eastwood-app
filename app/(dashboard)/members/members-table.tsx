"use client"

import { useRouter } from "next/navigation"
import { IconUsers } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type MemberRow, RowActions } from "./columns"

function MemberCard({ member }: { member: MemberRow }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/members/${member.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">
            {member.firstName} {member.lastName}
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions row={member} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Email</span>
          <span>{member.email ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Mobile</span>
          <span>{member.phone ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Small Group</span>
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
      </CardContent>
    </Card>
  )
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const columns = buildColumns()

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
          members.map((member) => <MemberCard key={member.id} member={member} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
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
