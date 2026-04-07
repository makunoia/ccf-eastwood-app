"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconDots, IconHeart, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

type EventVolunteer = {
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
}: {
  volunteer: EventVolunteer
  eventId: string
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
          <DropdownMenuItem onSelect={() => router.push(`/volunteers/${volunteer.id}`)}>
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
}: {
  volunteer: EventVolunteer
  eventId: string
}) {
  const router = useRouter()
  const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`
  const statusVariant = STATUS_VARIANT[volunteer.status] ?? "secondary"

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => router.push(`/volunteers/${volunteer.id}`)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{memberName}</p>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge variant={statusVariant}>{volunteer.status}</Badge>
            <VolunteerRowActions volunteer={volunteer} eventId={eventId} />
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

export function VolunteersTab({
  volunteers,
  eventId,
}: {
  volunteers: EventVolunteer[]
  eventId: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href="/volunteers/new">
            <IconPlus className="mr-2 size-4" />
            Add Volunteer
          </Link>
        </Button>
      </div>

      {volunteers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconHeart className="size-8" />
          <p className="text-sm">No volunteers yet</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="flex flex-col gap-2 md:hidden">
            {volunteers.map((v) => (
              <VolunteerCard key={v.id} volunteer={v} eventId={eventId} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Member</th>
                  <th className="px-4 py-3 text-left font-medium">Committee</th>
                  <th className="px-4 py-3 text-left font-medium">Preferred Role</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {volunteers.map((v) => {
                  const memberName = `${v.member.firstName} ${v.member.lastName}`
                  const statusVariant = STATUS_VARIANT[v.status] ?? "secondary"
                  return (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/volunteers/${v.id}`}
                          className="hover:underline"
                        >
                          {memberName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{v.committee.name}</td>
                      <td className="px-4 py-3">{v.preferredRole.name}</td>
                      <td className="px-4 py-3">
                        {v.assignedRole?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant}>{v.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <VolunteerRowActions volunteer={v} eventId={eventId} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
