"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconCopy,
  IconPencil,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  markRegistrantAttended,
  markRegistrantPaid,
  unmarkRegistrantAttended,
} from "../actions"

type Member = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
}

type Registrant = {
  id: string
  eventId: string
  memberId: string | null
  member: Member | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string | null
  mobileNumber: string | null
  isPaid: boolean
  paymentReference: string | null
  attendedAt: Date | null
  createdAt: Date
}

type Event = {
  id: string
  name: string
  description: string | null
  ministryId: string
  ministry: { id: string; name: string }
  startDate: Date
  endDate: Date
  price: number | null
  registrationStart: Date | null
  registrationEnd: Date | null
  registrants: Registrant[]
}

type Props = {
  event: Event
  ministries: { id: string; name: string }[]
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

function getRegistrationStatus(event: Event) {
  const now = new Date()
  if (!event.registrationStart || !event.registrationEnd) return null
  if (now < event.registrationStart) return "upcoming"
  if (now > event.registrationEnd) return "closed"
  return "open"
}

function RegistrantName({ r }: { r: Registrant }) {
  if (r.member) {
    return (
      <span>
        {r.member.firstName} {r.member.lastName}
        {r.nickname ? ` (${r.nickname})` : ""}
      </span>
    )
  }
  return (
    <span>
      {r.firstName} {r.lastName}
      {r.nickname ? ` (${r.nickname})` : ""}
    </span>
  )
}

function RegistrantContact({ r }: { r: Registrant }) {
  const mobile = r.member ? r.member.phone : r.mobileNumber
  const email = r.member ? r.member.email : r.email
  return (
    <span className="text-sm text-muted-foreground">
      {mobile ?? email ?? "—"}
    </span>
  )
}

function PaymentDialog({
  registrantId,
  eventId,
  open,
  onOpenChange,
}: {
  registrantId: string
  eventId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [reference, setReference] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function handleConfirm() {
    if (!reference.trim()) {
      toast.error("Payment reference is required")
      return
    }
    setSaving(true)
    const result = await markRegistrantPaid(registrantId, reference, eventId)
    setSaving(false)
    if (result.success) {
      toast.success("Marked as paid")
      onOpenChange(false)
      setReference("")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            Enter the payment reference number for this registrant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reference">Payment Reference</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. GCash ref #1234"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RegistrantsTab({
  registrants,
  eventId,
  isPaidEvent,
}: {
  registrants: Registrant[]
  eventId: string
  isPaidEvent: boolean
}) {
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [selectedRegistrantId, setSelectedRegistrantId] = React.useState<string | null>(null)
  const [togglingAttendance, setTogglingAttendance] = React.useState<string | null>(null)

  function openPaymentDialog(id: string) {
    setSelectedRegistrantId(id)
    setPaymentDialogOpen(true)
  }

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
              {isPaidEvent && (
                <th className="px-4 py-3 text-left font-medium">Payment</th>
              )}
              <th className="px-4 py-3 text-left font-medium">Attended</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {registrants.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <RegistrantName r={r} />
                </td>
                <td className="px-4 py-3">
                  <RegistrantContact r={r} />
                </td>
                <td className="px-4 py-3">
                  {r.memberId ? (
                    <Badge variant="secondary">Member</Badge>
                  ) : (
                    <Badge variant="outline">Guest</Badge>
                  )}
                </td>
                {isPaidEvent && (
                  <td className="px-4 py-3">
                    {r.isPaid ? (
                      <div className="flex items-center gap-1.5">
                        <IconCheck className="size-4 text-green-600" />
                        <span className="text-xs text-muted-foreground">
                          {r.paymentReference}
                        </span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPaymentDialog(r.id)}
                      >
                        Mark paid
                      </Button>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant={r.attendedAt ? "secondary" : "outline"}
                    onClick={() => toggleAttendance(r)}
                    disabled={togglingAttendance === r.id}
                  >
                    {r.attendedAt ? (
                      <>
                        <IconCheck className="mr-1 size-3.5" />
                        Attended
                      </>
                    ) : (
                      <>
                        <IconX className="mr-1 size-3.5" />
                        Absent
                      </>
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRegistrantId && (
        <PaymentDialog
          registrantId={selectedRegistrantId}
          eventId={eventId}
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
        />
      )}
    </>
  )
}

export function EventDetail({ event, ministries }: Props) {
  const router = useRouter()
  const regStatus = getRegistrationStatus(event)

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  const paidCount = event.registrants.filter((r) => r.isPaid).length
  const attendedCount = event.registrants.filter((r) => r.attendedAt).length

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Events
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{event.name}</h2>
          <p className="text-sm text-muted-foreground">{event.ministry.name}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/events/${event.id}/edit`)}
        >
          <IconPencil className="mr-2 size-4" />
          Edit
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="mt-0.5 text-sm font-medium">
            {formatDate(event.startDate)}
            {event.startDate.toISOString() !== event.endDate.toISOString() && (
              <> – {formatDate(event.endDate)}</>
            )}
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
            {regStatus === "open" && (
              <span className="text-green-600">Open</span>
            )}
            {regStatus === "upcoming" && (
              <span className="text-yellow-600">Upcoming</span>
            )}
            {regStatus === "closed" && (
              <span className="text-muted-foreground">Closed</span>
            )}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyLink(`/events/${event.id}/register`)}
        >
          <IconCopy className="mr-2 size-3.5" />
          Registration link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyLink(`/events/${event.id}/checkin`)}
        >
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
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
        </TabsList>

        <TabsContent value="registrants" className="mt-4 flex-1">
          <RegistrantsTab
            registrants={event.registrants}
            eventId={event.id}
            isPaidEvent={event.price != null}
          />
        </TabsContent>

        <TabsContent value="breakouts" className="mt-4">
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <p className="text-sm">Breakout groups — coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="volunteers" className="mt-4">
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <p className="text-sm">Volunteers — coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
