"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconBus,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assignToBus, unassignFromBus } from "@/app/(dashboard)/events/module-actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type BusPassenger = {
  id: string
  busId: string
  registrantId: string | null
  registrant: {
    id: string
    memberId: string | null
    firstName: string | null
    lastName: string | null
    member: { id: string; firstName: string; lastName: string; phone: string | null } | null
    guest: { id: string; firstName: string; lastName: string } | null
  } | null
  volunteerId: string | null
  volunteer: {
    id: string
    member: { id: string; firstName: string; lastName: string }
  } | null
}

type Bus = {
  id: string
  name: string
  capacity: number | null
  direction: string
  passengers: BusPassenger[]
}

type Registrant = {
  id: string
  memberId: string | null
  firstName: string | null
  lastName: string | null
  mobileNumber: string | null
  member: { id: string; firstName: string; lastName: string; phone: string | null } | null
  guest: { id: string; firstName: string; lastName: string } | null
}

type Volunteer = {
  id: string
  member: { id: string; firstName: string; lastName: string }
  busPassengers: { id: string; busId: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function registrantName(r: Registrant) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest)  return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

const DIRECTION_LABELS: Record<string, string> = {
  ToVenue: "To Venue",
  FromVenue: "From Venue",
  Both: "Both ways",
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  eventId: string
  buses: Bus[]
  registrants: Registrant[]
  volunteers: Volunteer[]
}

export function EmbarkationClient({ eventId, buses, registrants, volunteers }: Props) {
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false)
  const [selectedBusId, setSelectedBusId] = React.useState<string | null>(null)
  const [assigning, setAssigning] = React.useState(false)
  const [unassigning, setUnassigning] = React.useState<string | null>(null)
  const [assignType, setAssignType] = React.useState<"registrant" | "volunteer">("registrant")
  const [assignPersonId, setAssignPersonId] = React.useState("")

  const assignedRegistrantIds = new Set(buses.flatMap((b) => b.passengers.map((p) => p.registrantId).filter(Boolean)))
  const assignedVolunteerIds = new Set(buses.flatMap((b) => b.passengers.map((p) => p.volunteerId).filter(Boolean)))

  const unassignedRegistrants = registrants.filter((r) => !assignedRegistrantIds.has(r.id))
  const unassignedVolunteers = volunteers.filter((v) => !assignedVolunteerIds.has(v.id))

  function openAssignDialog(busId: string) {
    setSelectedBusId(busId)
    setAssignPersonId("")
    setAssignType("registrant")
    setAssignDialogOpen(true)
  }

  async function handleAssign() {
    if (!selectedBusId || !assignPersonId) return
    setAssigning(true)
    const result = await assignToBus(
      selectedBusId,
      eventId,
      assignType === "registrant" ? assignPersonId : null,
      assignType === "volunteer" ? assignPersonId : null
    )
    setAssigning(false)
    if (result.success) {
      toast.success("Assigned to bus")
      setAssignDialogOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  async function handleUnassign(passengerId: string) {
    setUnassigning(passengerId)
    const result = await unassignFromBus(passengerId, eventId)
    setUnassigning(null)
    if (!result.success) toast.error(result.error)
  }

  if (buses.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Embarkation</h2>
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconBus className="size-8" />
          <p className="text-sm">No buses configured.</p>
          <Link href={`/event/${eventId}/settings`} className="text-sm underline">
            Add buses in Event Settings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Embarkation</h2>
        <div className="flex flex-wrap gap-2">
          {buses.map((bus) => (
            <Badge key={bus.id} variant="outline" className="gap-1.5">
              <IconBus className="size-3.5" />
              {bus.name} — {bus.passengers.length}{bus.capacity != null ? `/${bus.capacity}` : ""}
            </Badge>
          ))}
          {unassignedRegistrants.length + unassignedVolunteers.length > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              {unassignedRegistrants.length + unassignedVolunteers.length} unassigned
            </Badge>
          )}
        </div>
      </div>

      {/* Per-bus tables */}
      <div className="space-y-4">
        {buses.map((bus) => (
          <div key={bus.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{bus.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {DIRECTION_LABELS[bus.direction]} ·{" "}
                  {bus.passengers.length}{bus.capacity != null ? `/${bus.capacity}` : ""} passengers
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/events/${eventId}/buses/${bus.id}/manifest`} target="_blank">
                    Print manifest
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAssignDialog(bus.id)}>
                  <IconPlus className="mr-1 size-3.5" />
                  Assign
                </Button>
              </div>
            </div>

            {bus.passengers.length === 0 ? (
              <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                No passengers assigned yet
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {bus.passengers.map((p) => {
                      const name = p.registrant
                        ? (p.registrant.member
                            ? `${p.registrant.member.firstName} ${p.registrant.member.lastName}`
                            : p.registrant.guest
                              ? `${p.registrant.guest.firstName} ${p.registrant.guest.lastName}`
                              : `${p.registrant.firstName ?? ""} ${p.registrant.lastName ?? ""}`.trim())
                        : p.volunteer
                          ? `${p.volunteer.member.firstName} ${p.volunteer.member.lastName}`
                          : "—"
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{name}</td>
                          <td className="px-4 py-3">
                            {p.volunteerId
                              ? <Badge variant="outline">Volunteer</Badge>
                              : p.registrant?.memberId
                                ? <Badge variant="secondary">Member</Badge>
                                : <Badge variant="outline">Guest</Badge>
                            }
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive hover:text-destructive"
                              onClick={() => handleUnassign(p.id)}
                              disabled={unassigning === p.id}
                            >
                              <IconTrash className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assign dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to bus</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={assignType}
                onValueChange={(v) => { setAssignType(v as "registrant" | "volunteer"); setAssignPersonId("") }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="registrant">Registrant</SelectItem>
                  <SelectItem value="volunteer">Volunteer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Person</Label>
              <Select value={assignPersonId} onValueChange={setAssignPersonId}>
                <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {assignType === "registrant"
                    ? unassignedRegistrants.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{registrantName(r)}</SelectItem>
                      ))
                    : unassignedVolunteers.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.member.firstName} {v.member.lastName}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning || !assignPersonId}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
