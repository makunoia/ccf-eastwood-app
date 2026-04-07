"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconArrowLeft,
  IconBus,
  IconCheck,
  IconClock,
  IconCopy,
  IconPencil,
  IconPlus,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  markRegistrantAttended,
  markRegistrantPaid,
  unmarkRegistrantAttended,
} from "../actions"
import {
  addBaptismOptIn,
  removeBaptismOptIn,
  assignToBus,
  unassignFromBus,
} from "../module-actions"
import { BreakoutGroupsTab } from "./breakouts-tab"
import { VolunteersTab, type VolunteerGroup } from "./volunteers-tab"

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
type LedGroup = {
  id: string
  name: string
  lifeStageId: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
}
type VolunteerMember = { id: string; firstName: string; lastName: string; ledGroups: LedGroup[] }

type Registrant = {
  id: string
  eventId: string
  memberId: string | null
  member: Member | null
  guest: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string | null
  mobileNumber: string | null
  isPaid: boolean
  paymentReference: string | null
  attendedAt: Date | null
  createdAt: Date
  baptismOptIn: { id: string } | null
}

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

type Volunteer = {
  id: string
  status: string
  notes: string | null
  member: VolunteerMember
  committee: { id: string; name: string }
  preferredRole: { id: string; name: string }
  assignedRole: { id: string; name: string } | null
  busPassengers?: { id: string; busId: string }[]
}

type BreakoutGroupMemberRow = {
  breakoutGroupId: string
  registrantId: string
  assignedAt: Date
  registrant: {
    id: string
    memberId: string | null
    guestId: string | null
    firstName: string | null
    lastName: string | null
    nickname: string | null
    mobileNumber: string | null
    member: { id: string; firstName: string; lastName: string } | null
    guest: { id: string; firstName: string; lastName: string } | null
  }
}

type BreakoutGroup = {
  id: string
  name: string
  facilitatorId: string | null
  facilitator: { id: string; member: VolunteerMember } | null
  coFacilitatorId: string | null
  coFacilitator: { id: string; member: VolunteerMember } | null
  memberLimit: number | null
  lifeStageId: string | null
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  members: BreakoutGroupMemberRow[]
}

type MinistryForEvent = {
  id: string
  name: string
  lifeStage: { id: string; name: string } | null
  volunteers: Volunteer[]
}

type Event = {
  id: string
  name: string
  description: string | null
  ministries: { ministry: MinistryForEvent }[]
  startDate: Date
  endDate: Date
  price: number | null
  registrationStart: Date | null
  registrationEnd: Date | null
  modules: { type: string }[]
  registrants: Registrant[]
  baptismOptIns: { registrantId: string }[]
  buses: Bus[]
  volunteers: Volunteer[]
  breakoutGroups: BreakoutGroup[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date) {
  return d.toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  })
}

function getRegistrationStatus(event: Event) {
  const now = new Date()
  if (!event.registrationStart || !event.registrationEnd) return null
  if (now < event.registrationStart) return "upcoming"
  if (now > event.registrationEnd) return "closed"
  return "open"
}

function registrantDisplayName(r: Registrant) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest)  return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

function registrantMobile(r: Registrant) {
  if (r.member) return r.member.phone
  if (r.guest)  return r.guest.phone
  return r.mobileNumber
}

const DIRECTION_LABELS: Record<string, string> = {
  ToVenue: "To Venue",
  FromVenue: "From Venue",
  Both: "Both ways",
}

// ─── Registrants tab ──────────────────────────────────────────────────────────

function PaymentDialog({
  registrantId, eventId, open, onOpenChange,
}: { registrantId: string; eventId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reference, setReference] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function handleConfirm() {
    if (!reference.trim()) { toast.error("Payment reference is required"); return }
    setSaving(true)
    const result = await markRegistrantPaid(registrantId, reference, eventId)
    setSaving(false)
    if (result.success) { toast.success("Marked as paid"); onOpenChange(false); setReference("") }
    else toast.error(result.error)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>Enter the payment reference number.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reference">Payment Reference</Label>
          <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. GCash ref #1234" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RegistrantsTab({ registrants, eventId, isPaidEvent }: { registrants: Registrant[]; eventId: string; isPaidEvent: boolean }) {
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [togglingAttendance, setTogglingAttendance] = React.useState<string | null>(null)

  async function toggleAttendance(r: Registrant) {
    setTogglingAttendance(r.id)
    const result = r.attendedAt
      ? await unmarkRegistrantAttended(r.id, eventId)
      : await markRegistrantAttended(r.id, eventId)
    setTogglingAttendance(null)
    if (!result.success) toast.error(result.error)
  }

  if (registrants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconClock className="size-8" />
        <p className="text-sm">No registrants yet</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Contact</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              {isPaidEvent && <th className="px-4 py-3 text-left font-medium">Payment</th>}
              <th className="px-4 py-3 text-left font-medium">Attended</th>
            </tr>
          </thead>
          <tbody>
            {registrants.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{registrantDisplayName(r)}</td>
                <td className="px-4 py-3 text-muted-foreground text-sm">{registrantMobile(r) ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.memberId ? <Badge variant="secondary">Member</Badge> : <Badge variant="outline">Guest</Badge>}
                </td>
                {isPaidEvent && (
                  <td className="px-4 py-3">
                    {r.isPaid ? (
                      <div className="flex items-center gap-1.5">
                        <IconCheck className="size-4 text-green-600" />
                        <span className="text-xs text-muted-foreground">{r.paymentReference}</span>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => { setSelectedId(r.id); setPaymentDialogOpen(true) }}>
                        Mark paid
                      </Button>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <Button size="sm" variant={r.attendedAt ? "secondary" : "outline"} onClick={() => toggleAttendance(r)} disabled={togglingAttendance === r.id}>
                    {r.attendedAt ? <><IconCheck className="mr-1 size-3.5" />Attended</> : <><IconX className="mr-1 size-3.5" />Absent</>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedId && <PaymentDialog registrantId={selectedId} eventId={eventId} open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} />}
    </>
  )
}

// ─── Baptism tab ──────────────────────────────────────────────────────────────

function BaptismTab({ registrants, eventId }: { registrants: Registrant[]; eventId: string }) {
  const [toggling, setToggling] = React.useState<string | null>(null)
  const attended = registrants.filter((r) => r.attendedAt)
  const optedIn = registrants.filter((r) => r.baptismOptIn)

  async function toggle(r: Registrant) {
    setToggling(r.id)
    const result = r.baptismOptIn
      ? await removeBaptismOptIn(eventId, r.id)
      : await addBaptismOptIn(eventId, r.id)
    setToggling(null)
    if (!result.success) toast.error(result.error)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{optedIn.length} opted in</Badge>
        {attended.length === 0 && (
          <p className="text-xs text-muted-foreground">Mark attendance first — only attended registrants are shown</p>
        )}
      </div>

      {attended.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No attended registrants yet. Check in attendees first.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Baptism</th>
              </tr>
            </thead>
            <tbody>
              {attended.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{registrantDisplayName(r)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{registrantMobile(r) ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.memberId ? <Badge variant="secondary">Member</Badge> : <Badge variant="outline">Guest</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={r.baptismOptIn ? "default" : "outline"}
                      onClick={() => toggle(r)}
                      disabled={toggling === r.id}
                    >
                      {r.baptismOptIn ? <><IconCheck className="mr-1 size-3.5" />Opted in</> : "Add"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Embarkation tab ──────────────────────────────────────────────────────────

function EmbarkationTab({
  buses,
  registrants,
  volunteers,
  eventId,
}: {
  buses: Bus[]
  registrants: Registrant[]
  volunteers: Volunteer[]
  eventId: string
}) {
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false)
  const [selectedBusId, setSelectedBusId] = React.useState<string | null>(null)
  const [assigning, setAssigning] = React.useState(false)
  const [unassigning, setUnassigning] = React.useState<string | null>(null)

  // All assigned passenger IDs (registrant or volunteer)
  const assignedRegistrantIds = new Set(buses.flatMap((b) => b.passengers.map((p) => p.registrantId).filter(Boolean)))
  const assignedVolunteerIds = new Set(buses.flatMap((b) => b.passengers.map((p) => p.volunteerId).filter(Boolean)))

  const unassignedRegistrants = registrants.filter((r) => !assignedRegistrantIds.has(r.id))
  const unassignedVolunteers = volunteers.filter((v) => !assignedVolunteerIds.has(v.id))

  const [assignType, setAssignType] = React.useState<"registrant" | "volunteer">("registrant")
  const [assignPersonId, setAssignPersonId] = React.useState("")

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
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconBus className="size-8" />
        <p className="text-sm">No buses configured.</p>
        <Link href={`/events/${eventId}/settings`} className="text-sm underline">
          Add buses in Event Settings
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        {buses.map((bus) => {
          const pct = bus.capacity ? Math.round((bus.passengers.length / bus.capacity) * 100) : null
          return (
            <Badge key={bus.id} variant="outline" className="gap-1.5">
              <IconBus className="size-3.5" />
              {bus.name} — {bus.passengers.length}{bus.capacity != null ? `/${bus.capacity}` : ""}
            </Badge>
          )
        })}
        {unassignedRegistrants.length + unassignedVolunteers.length > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {unassignedRegistrants.length + unassignedVolunteers.length} unassigned
          </Badge>
        )}
      </div>

      {/* Per-bus tables */}
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
            <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">No passengers assigned yet</p>
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

      {/* Assign dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to bus</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={assignType} onValueChange={(v) => { setAssignType(v as "registrant" | "volunteer"); setAssignPersonId("") }}>
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
                        <SelectItem key={r.id} value={r.id}>{registrantDisplayName(r)}</SelectItem>
                      ))
                    : unassignedVolunteers.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.member.firstName} {v.member.lastName}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>Cancel</Button>
            <Button onClick={handleAssign} disabled={assigning || !assignPersonId}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EventDetail({ event, lifeStages }: { event: Event; lifeStages: { id: string; name: string }[] }) {
  const router = useRouter()
  const regStatus = getRegistrationStatus(event)
  const enabledModules = new Set(event.modules.map((m) => m.type))

  const paidCount = event.registrants.filter((r) => r.isPaid).length
  const attendedCount = event.registrants.filter((r) => r.attendedAt).length
  const baptismCount = event.baptismOptIns.length

  const volunteerGroups: VolunteerGroup[] = [
    ...event.ministries.map((em) => ({
      label: em.ministry.name,
      source: "ministry" as const,
      volunteers: em.ministry.volunteers,
    })),
    ...(event.volunteers.length > 0 || event.ministries.length === 0
      ? [{ label: "Event", source: "event" as const, volunteers: event.volunteers }]
      : []),
  ]
  const totalVolunteerCount = volunteerGroups.reduce((sum, g) => sum + g.volunteers.length, 0)

  const confirmedVolunteers = [
    ...event.volunteers.filter((v) => v.status === "Confirmed"),
    ...event.ministries.flatMap((em) =>
      em.ministry.volunteers.filter((v) => v.status === "Confirmed")
    ),
  ]

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" />
          Events
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{event.name}</h2>
          {event.ministries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {event.ministries.map((em) => em.ministry.name).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/events/${event.id}/settings`)}>
            <IconSettings className="mr-2 size-4" />
            Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/events/${event.id}/edit`)}>
            <IconPencil className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="mt-0.5 text-sm font-medium">
            {formatDate(event.startDate)}
            {event.startDate.toISOString() !== event.endDate.toISOString() && <> – {formatDate(event.endDate)}</>}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Price</p>
          <p className="mt-0.5 text-sm font-medium">
            {event.price != null
              ? `₱${(event.price / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
              : "Free"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Registration</p>
          <p className="mt-0.5 text-sm font-medium">
            {regStatus === "open" && <span className="text-green-600">Open</span>}
            {regStatus === "upcoming" && <span className="text-yellow-600">Upcoming</span>}
            {regStatus === "closed" && <span className="text-muted-foreground">Closed</span>}
            {!regStatus && <span className="text-muted-foreground">—</span>}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Registrants</p>
          <p className="mt-0.5 text-sm font-medium">
            {event.registrants.length}
            {event.price != null && ` · ${paidCount} paid`}
            {` · ${attendedCount} attended`}
          </p>
        </div>
      </div>

      {/* Public links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/register`)}>
          <IconCopy className="mr-2 size-3.5" />
          Registration link
        </Button>
        <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/checkin`)}>
          <IconCopy className="mr-2 size-3.5" />
          Check-in link
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="registrants" className="flex flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="registrants">
            Registrants ({event.registrants.length})
          </TabsTrigger>
          <TabsTrigger value="breakouts">Breakout Groups</TabsTrigger>
          <TabsTrigger value="volunteers">
            Volunteers {totalVolunteerCount > 0 && `(${totalVolunteerCount})`}
          </TabsTrigger>
          {enabledModules.has("Baptism") && (
            <TabsTrigger value="baptism">
              Baptism {baptismCount > 0 && `(${baptismCount})`}
            </TabsTrigger>
          )}
          {enabledModules.has("Embarkation") && (
            <TabsTrigger value="embarkation">Embarkation</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="registrants" className="mt-4 flex-1">
          <RegistrantsTab registrants={event.registrants} eventId={event.id} isPaidEvent={event.price != null} />
        </TabsContent>

        <TabsContent value="breakouts" className="mt-4">
          <BreakoutGroupsTab
            eventId={event.id}
            breakoutGroups={event.breakoutGroups}
            registrants={event.registrants}
            volunteers={confirmedVolunteers}
            lifeStages={lifeStages}
          />
        </TabsContent>

        <TabsContent value="volunteers" className="mt-4">
          <VolunteersTab groups={volunteerGroups} eventId={event.id} />
        </TabsContent>

        {enabledModules.has("Baptism") && (
          <TabsContent value="baptism" className="mt-4">
            <BaptismTab registrants={event.registrants} eventId={event.id} />
          </TabsContent>
        )}

        {enabledModules.has("Embarkation") && (
          <TabsContent value="embarkation" className="mt-4">
            <EmbarkationTab
              buses={event.buses}
              registrants={event.registrants}
              volunteers={confirmedVolunteers}
              eventId={event.id}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
