"use client"

import { useRouter } from "next/navigation"
import { IconHome } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type FamilyRow, RowActions } from "./columns"

function FamilyCard({ family, canWrite }: { family: FamilyRow; canWrite: boolean }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/families/${family.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{family.name}</p>
          {canWrite && (
            <div onClick={(e) => e.stopPropagation()}>
              <RowActions row={family} />
            </div>
          )}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Parents</span>
          <span>
            {family.parents || <span className="text-muted-foreground">—</span>}
          </span>
          <span className="text-muted-foreground">Children</span>
          <span>{family.childCount}</span>
          <span className="text-muted-foreground">Total</span>
          <span>{family.memberCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function FamiliesTable({
  families,
  canWrite,
}: {
  families: FamilyRow[]
  canWrite: boolean
}) {
  const columns = buildColumns(canWrite)

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {families.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconHome className="size-8" />
            <p className="text-sm">No families yet</p>
          </div>
        ) : (
          families.map((family) => (
            <FamilyCard key={family.id} family={family} canWrite={canWrite} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          columns={columns}
          data={families}
          emptyState={
            <>
              <IconHome className="size-8" />
              <p className="text-sm">No families yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
