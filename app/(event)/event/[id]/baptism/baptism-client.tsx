"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { phoneColumn } from "@/lib/tables/columns/contact"
import { PageHeader } from "@/components/page-header"
import { addBaptismOptIn, removeBaptismOptIn } from "@/app/(dashboard)/events/module-actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type Registrant = {
  id: string
  memberId: string | null
  firstName: string | null
  lastName: string | null
  mobileNumber: string | null
  attendedAt: string | null
  member: { id: string; firstName: string; lastName: string; phone: string | null } | null
  guest: { id: string; firstName: string; lastName: string; phone: string | null } | null
  baptismOptIn: { id: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(r: Registrant) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest)  return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

function displayMobile(r: Registrant) {
  if (r.member) return r.member.phone
  if (r.guest)  return r.guest.phone
  return r.mobileNumber
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  eventId: string
  registrants: Registrant[]
}

function buildColumns({
  toggling,
  onToggle,
}: {
  toggling: string | null
  onToggle: (r: Registrant) => void
}): ColumnDef<Registrant>[] {
  return [
    {
      id: "name",
      accessorFn: displayName,
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => <span className="font-medium">{displayName(row.original)}</span>,
    },
    phoneColumn<Registrant>(displayMobile),
    {
      id: "type",
      accessorFn: (row) => (row.memberId ? "Member" : "Guest"),
      header: "Type",
      meta: { label: "Type", width: "narrow" },
      cell: ({ row }) =>
        row.original.memberId ? (
          <Badge variant="secondary">Member</Badge>
        ) : (
          <Badge variant="outline">Guest</Badge>
        ),
    },
    {
      id: "baptism",
      accessorFn: (row) => (row.baptismOptIn ? 1 : 0),
      header: "Baptism",
      meta: { label: "Baptism", width: "status", locked: true },
      cell: ({ row }) => (
        <Button
          size="sm"
          variant={row.original.baptismOptIn ? "default" : "outline"}
          onClick={() => onToggle(row.original)}
          disabled={toggling === row.original.id}
        >
          {row.original.baptismOptIn ? (
            <>
              <IconCheck className="mr-1 size-3.5" />
              Opted in
            </>
          ) : (
            "Add"
          )}
        </Button>
      ),
    },
  ]
}

export function BaptismClient({ eventId, registrants }: Props) {
  const [toggling, setToggling] = React.useState<string | null>(null)

  const attended = registrants.filter((r) => r.attendedAt)
  const optedIn = registrants.filter((r) => r.baptismOptIn)

  const toggle = React.useCallback(
    async (r: Registrant) => {
      setToggling(r.id)
      const result = r.baptismOptIn
        ? await removeBaptismOptIn(eventId, r.id)
        : await addBaptismOptIn(eventId, r.id)
      setToggling(null)
      if (!result.success) toast.error(result.error)
    },
    [eventId],
  )

  const columns = React.useMemo(
    () => buildColumns({ toggling, onToggle: toggle }),
    [toggling, toggle],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Baptism"
        actions={<Badge variant="secondary">{optedIn.length} opted in</Badge>}
      />

      {attended.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No attended registrants yet.</p>
          <p className="text-xs">Mark attendance first — only attended registrants are shown here.</p>
        </div>
      ) : (
        <DataTable tableKey="event.baptism" rowLabel={{ one: "registrant", many: "registrants" }} columns={columns} data={attended} />
      )}
    </div>
  )
}
