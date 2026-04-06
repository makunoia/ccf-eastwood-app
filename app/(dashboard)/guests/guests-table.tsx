"use client"

import { IconUserScan } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type GuestRow } from "./columns"

function GuestCard({ guest }: { guest: GuestRow }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="font-medium leading-tight">
          {guest.firstName} {guest.lastName}
        </p>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Email</span>
          <span>{guest.email ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Mobile</span>
          <span>{guest.phone ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Events</span>
          <span>{guest.eventCount}</span>
          <span className="text-muted-foreground">Life Stage</span>
          <span>{guest.lifeStage ?? <span className="text-muted-foreground">—</span>}</span>
          <span className="text-muted-foreground">Date Added</span>
          <span>
            {new Date(guest.dateAdded).toLocaleDateString("en-PH", {
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

export function GuestsTable({ guests }: { guests: GuestRow[] }) {
  const columns = buildColumns()

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {guests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconUserScan className="size-8" />
            <p className="text-sm">No guests yet</p>
          </div>
        ) : (
          guests.map((guest) => <GuestCard key={guest.id} guest={guest} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={guests}
          emptyState={
            <>
              <IconUserScan className="size-8" />
              <p className="text-sm">No guests yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
