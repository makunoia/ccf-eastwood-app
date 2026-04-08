"use client"

import * as React from "react"
import Link from "next/link"
import { IconCheck, IconClock, IconX } from "@tabler/icons-react"
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
  markRegistrantAttended,
  markRegistrantPaid,
  unmarkRegistrantAttended,
} from "@/app/(dashboard)/events/actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type Registrant = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  email: string | null
  mobileNumber: string | null
  isPaid: boolean
  paymentReference: string | null
  attendedAt: string | null
  createdAt: string
  member: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
  guest: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
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

// ─── Payment dialog ───────────────────────────────────────────────────────────

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

// ─── Main client component ────────────────────────────────────────────────────

type Props = {
  eventId: string
  eventType: string
  isPaidEvent: boolean
  registrants: Registrant[]
}

export function RegistrantsClient({ eventId, eventType, isPaidEvent, registrants }: Props) {
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [togglingAttendance, setTogglingAttendance] = React.useState<string | null>(null)

  const isRecurringOrMultiDay = eventType === "Recurring" || eventType === "MultiDay"

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
      <div className="flex flex-1 flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold">Registrants</h2>
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconClock className="size-8" />
          <p className="text-sm">No registrants yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Registrants</h2>
        <span className="text-sm text-muted-foreground">{registrants.length} total</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Contact</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              {!isRecurringOrMultiDay && isPaidEvent && (
                <th className="px-4 py-3 text-left font-medium">Payment</th>
              )}
              {isRecurringOrMultiDay ? (
                <th className="px-4 py-3 text-left font-medium">Registered</th>
              ) : (
                <th className="px-4 py-3 text-left font-medium">Attended</th>
              )}
            </tr>
          </thead>
          <tbody>
            {registrants.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/event/${eventId}/registrants/${r.id}`}
                    className="hover:underline"
                  >
                    {displayName(r)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-sm">{displayMobile(r) ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.memberId ? <Badge variant="secondary">Member</Badge> : <Badge variant="outline">Guest</Badge>}
                </td>
                {!isRecurringOrMultiDay && isPaidEvent && (
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
                {isRecurringOrMultiDay ? (
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en-PH", {
                      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
                    })}
                  </td>
                ) : (
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={r.attendedAt ? "secondary" : "outline"}
                      onClick={() => toggleAttendance(r)}
                      disabled={togglingAttendance === r.id}
                    >
                      {r.attendedAt
                        ? <><IconCheck className="mr-1 size-3.5" />Attended</>
                        : <><IconX className="mr-1 size-3.5" />Absent</>}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <PaymentDialog
          registrantId={selectedId}
          eventId={eventId}
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
        />
      )}
    </div>
  )
}
