"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconDots, IconHeart, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { buildSelectionColumn } from "@/components/batch/selection-column"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteEventVolunteer } from "./actions"

export type EventVolunteer = {
  id: string
  status: string
  notes: string | null
  member: { id: string; firstName: string; lastName: string }
  committee: { id: string; name: string }
  preferredRole: { id: string; name: string }
  assignedRole: { id: string; name: string } | null
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
}

function VolunteerRowActions({
  volunteer,
  eventId,
  onNavigate,
}: {
  volunteer: EventVolunteer
  eventId: string
  onNavigate: () => void
}) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEventVolunteer(volunteer.id, eventId)
    setDeleting(false)
    if (result.success) {
      toast.success("Volunteer removed")
      setDeleteOpen(false)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <span className="sr-only">Open menu</span>
            <IconDots className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { onNavigate(); router.push(`/event/${eventId}/volunteers/${volunteer.id}`) }}>
            <IconPencil className="mr-2 size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <IconTrash className="mr-2 size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{memberName}</span> as a volunteer? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function VolunteerCard({
  volunteer,
  eventId,
  onNavigate,
}: {
  volunteer: EventVolunteer
  eventId: string
  onNavigate: () => void
}) {
  const router = useRouter()
  const selection = useBatchSelection()
  const selecting = selection?.enabled && selection.selectMode
  const checked = selection?.isSelected(volunteer.id) ?? false
  const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`
  const statusVariant = STATUS_VARIANT[volunteer.status] ?? "secondary"

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0 data-[selected=true]:border-primary"
      data-selected={checked}
      onClick={() => {
        if (selecting) {
          selection?.toggle(volunteer.id)
          return
        }
        onNavigate()
        router.push(`/event/${eventId}/volunteers/${volunteer.id}`)
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            {selecting && (
              <Checkbox
                checked={checked}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => selection?.toggle(volunteer.id)}
                aria-label={`Select ${memberName}`}
                className="mt-0.5"
              />
            )}
            <p className="font-medium leading-tight">{memberName}</p>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge variant={statusVariant}>{volunteer.status}</Badge>
            {!selecting && (
              <VolunteerRowActions volunteer={volunteer} eventId={eventId} onNavigate={onNavigate} />
            )}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Committee</span>
          <span>{volunteer.committee.name}</span>
          <span className="text-muted-foreground">Preferred Role</span>
          <span>{volunteer.preferredRole.name}</span>
          <span className="text-muted-foreground">Assigned Role</span>
          <span>
            {volunteer.assignedRole?.name ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function buildColumns({
  selectable,
  eventId,
  onNavigate,
}: {
  selectable: boolean
  eventId: string
  onNavigate: () => void
}): ColumnDef<EventVolunteer>[] {
  return [
    ...(selectable ? [buildSelectionColumn<EventVolunteer>()] : []),
    {
      id: "member",
      accessorFn: (row) => `${row.member.firstName} ${row.member.lastName}`,
      header: "Member",
      meta: { label: "Member", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/volunteers/${row.original.id}`}
          onClick={onNavigate}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.member.firstName} {row.original.member.lastName}
        </Link>
      ),
    },
    {
      id: "committee",
      accessorFn: (row) => row.committee.name,
      header: "Committee",
      meta: { label: "Committee", width: "text" },
    },
    {
      id: "preferredRole",
      accessorFn: (row) => row.preferredRole.name,
      header: "Preferred Role",
      meta: { label: "Preferred Role", width: "text" },
    },
    {
      id: "assignedRole",
      accessorFn: (row) => row.assignedRole?.name ?? "",
      header: "Assigned Role",
      meta: { label: "Assigned Role", width: "text" },
      cell: ({ row }) =>
        row.original.assignedRole?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: { label: "Status", width: "narrow" },
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      meta: { width: "actions", locked: true },
      cell: ({ row }) => (
        <VolunteerRowActions volunteer={row.original} eventId={eventId} onNavigate={onNavigate} />
      ),
    },
  ]
}

function VolunteersDesktopTable({
  volunteers,
  eventId,
  onNavigate,
}: {
  volunteers: EventVolunteer[]
  eventId: string
  onNavigate: () => void
}) {
  const selection = useBatchSelection()
  const selectable = selection?.enabled ?? false

  const columns = React.useMemo(
    () => buildColumns({ selectable, eventId, onNavigate }),
    [selectable, eventId, onNavigate],
  )

  return (
    <div className="flex flex-1 flex-col">
      <DataTable tableKey="event.volunteers-tab" rowLabel={{ one: "volunteer", many: "volunteers" }} columns={columns} data={volunteers} />
    </div>
  )
}

export function VolunteersTab({
  volunteers,
  eventId,
}: {
  volunteers: EventVolunteer[]
  eventId: string
}) {
  const saveVolunteerIds = React.useCallback(() => {
    sessionStorage.setItem("volunteerListIds", JSON.stringify(volunteers.map((v) => v.id)))
  }, [volunteers])

  return (
    <div className="flex flex-col gap-4">
      {volunteers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconHeart className="size-8" />
          <p className="text-sm">No volunteers yet</p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="flex flex-col gap-2 md:hidden">
            {volunteers.map((v) => (
              <VolunteerCard key={v.id} volunteer={v} eventId={eventId} onNavigate={saveVolunteerIds} />
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden md:block">
            <VolunteersDesktopTable volunteers={volunteers} eventId={eventId} onNavigate={saveVolunteerIds} />
          </div>
        </>
      )}
    </div>
  )
}
