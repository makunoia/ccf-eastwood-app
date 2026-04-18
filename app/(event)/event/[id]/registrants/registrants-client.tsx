"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  IconCheck,
  IconClock,
  IconPlus,
  IconUpload,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
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
import { SearchInput } from "@/components/search-input"
import { ImportWizard } from "@/components/import/import-wizard"
import {
  markRegistrantAttended,
  markRegistrantPaid,
  unmarkRegistrantAttended,
} from "@/app/(dashboard)/events/actions"
import {
  addEventRegistrant,
  checkRegistrantDuplicates,
  importEventRegistrants,
} from "./import-actions"

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

function displayEmail(r: Registrant) {
  if (r.member) return r.member.email
  if (r.guest)  return r.guest.email
  return r.email
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Registrant dialog ────────────────────────────────────────────────────

function AddRegistrantDialog({
  eventId, open, onOpenChange,
}: { eventId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName]   = React.useState("")
  const [email, setEmail]         = React.useState("")
  const [mobile, setMobile]       = React.useState("")
  const [nickname, setNickname]   = React.useState("")
  const [saving, setSaving]       = React.useState(false)

  function reset() {
    setFirstName(""); setLastName(""); setEmail(""); setMobile(""); setNickname("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required")
      return
    }
    setSaving(true)
    const result = await addEventRegistrant(eventId, {
      firstName, lastName,
      email: email || undefined,
      mobileNumber: mobile || undefined,
      nickname: nickname || undefined,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Registrant added")
      onOpenChange(false)
      reset()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Registrant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-first">First Name *</Label>
              <Input id="add-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-last">Last Name *</Label>
              <Input id="add-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-nick">Nickname</Label>
            <Input id="add-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-mobile">Mobile Number</Label>
            <Input id="add-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="09XXXXXXXXX" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add Registrant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function RegistrantCard({
  r, eventId, isRecurringOrMultiDay, isPaidEvent,
  onMarkPaid, onToggleAttendance, toggling,
}: {
  r: Registrant
  eventId: string
  isRecurringOrMultiDay: boolean
  isPaidEvent: boolean
  onMarkPaid: (id: string) => void
  onToggleAttendance: (r: Registrant) => void
  toggling: string | null
}) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
      onClick={() => router.push(`/event/${eventId}/registrants/${r.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{displayName(r)}</p>
          <Badge variant={r.memberId ? "secondary" : "outline"}>
            {r.memberId ? "Member" : "Guest"}
          </Badge>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {displayMobile(r) && (
            <>
              <span className="text-muted-foreground">Mobile</span>
              <span>{displayMobile(r)}</span>
            </>
          )}
          {displayEmail(r) && (
            <>
              <span className="text-muted-foreground">Email</span>
              <span className="truncate">{displayEmail(r)}</span>
            </>
          )}
          {!isRecurringOrMultiDay && isPaidEvent && (
            <>
              <span className="text-muted-foreground">Payment</span>
              <span>
                {r.isPaid ? (
                  <span className="flex items-center gap-1 text-green-700">
                    <IconCheck className="size-3.5" />
                    {r.paymentReference}
                  </span>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkPaid(r.id) }}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark paid
                  </button>
                )}
              </span>
            </>
          )}
          <span className="text-muted-foreground">
            {isRecurringOrMultiDay ? "Registered" : "Attended"}
          </span>
          <span>
            {isRecurringOrMultiDay ? (
              new Date(r.createdAt).toLocaleDateString("en-PH", {
                month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
              })
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleAttendance(r) }}
                disabled={toggling === r.id}
                className={[
                  "flex items-center gap-1 text-xs",
                  r.attendedAt ? "text-green-700" : "text-muted-foreground",
                ].join(" ")}
              >
                {r.attendedAt
                  ? <><IconCheck className="size-3.5" />Attended</>
                  : <><IconX className="size-3.5" />Absent</>}
              </button>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function RegistrantsFilters({
  search, typeFilter,
}: { search: string; typeFilter: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const hasFilters = search || typeFilter

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const current = { search, type: typeFilter, ...overrides }
    if (current.search) params.set("search", current.search)
    if (current.type) params.set("type", current.type)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setFilter(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        defaultValue={search}
        placeholder="Search registrants..."
        onChange={(value) => setFilter("search", value)}
        className="min-w-48"
      />
      <Select
        value={typeFilter || "all"}
        onValueChange={(v) => setFilter("type", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="member">Members</SelectItem>
          <SelectItem value="guest">Guests</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <IconX className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

type Props = {
  eventId: string
  eventType: string
  isPaidEvent: boolean
  search: string
  typeFilter: string
  registrants: Registrant[]
}

export function RegistrantsClient({
  eventId, eventType, isPaidEvent, search, typeFilter, registrants,
}: Props) {
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [addDialogOpen, setAddDialogOpen]         = React.useState(false)
  const [selectedId, setSelectedId]               = React.useState<string | null>(null)
  const [togglingAttendance, setTogglingAttendance] = React.useState<string | null>(null)
  const [importOpen, setImportOpen]               = React.useState(false)

  const isRecurringOrMultiDay = eventType === "Recurring" || eventType === "MultiDay"

  async function toggleAttendance(r: Registrant) {
    setTogglingAttendance(r.id)
    const result = r.attendedAt
      ? await unmarkRegistrantAttended(r.id, eventId)
      : await markRegistrantAttended(r.id, eventId)
    setTogglingAttendance(null)
    if (!result.success) toast.error(result.error)
  }

  const importWizard = (
    <ImportWizard
      config={{ entity: "event-registrant", context: { eventId } }}
      open={importOpen}
      onOpenChange={setImportOpen}
      onCheckDuplicates={(rows) => checkRegistrantDuplicates(eventId, rows)}
      onImport={(rows) => importEventRegistrants(eventId, rows)}
    />
  )

  const toolbar = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{registrants.length} shown</span>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>
      <Button size="sm" onClick={() => setAddDialogOpen(true)}>
        <IconPlus className="size-4" />
        <span className="hidden sm:inline">Add</span>
      </Button>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Registrants</h2>
        {toolbar}
      </div>

      {/* Filters */}
      <RegistrantsFilters search={search} typeFilter={typeFilter} />

      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {registrants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconUsers className="size-8" />
            <p className="text-sm">{search || typeFilter ? "No registrants match your search" : "No registrants yet"}</p>
          </div>
        ) : (
          registrants.map((r) => (
            <RegistrantCard
              key={r.id}
              r={r}
              eventId={eventId}
              isRecurringOrMultiDay={isRecurringOrMultiDay}
              isPaidEvent={isPaidEvent}
              onMarkPaid={(id) => { setSelectedId(id); setPaymentDialogOpen(true) }}
              onToggleAttendance={toggleAttendance}
              toggling={togglingAttendance}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        {registrants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconClock className="size-8" />
            <p className="text-sm">{search || typeFilter ? "No registrants match your search" : "No registrants yet"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Contact</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Type</th>
                  {!isRecurringOrMultiDay && isPaidEvent && (
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Payment</th>
                  )}
                  {isRecurringOrMultiDay ? (
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Registered</th>
                  ) : (
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Attended</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {registrants.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/event/${eventId}/registrants/${r.id}`}
                        className="hover:underline"
                      >
                        {displayName(r)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm whitespace-nowrap">
                      {displayMobile(r) ?? displayEmail(r) ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.memberId
                        ? <Badge variant="secondary">Member</Badge>
                        : <Badge variant="outline">Guest</Badge>}
                    </td>
                    {!isRecurringOrMultiDay && isPaidEvent && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.isPaid ? (
                          <div className="flex items-center gap-1.5">
                            <IconCheck className="size-4 text-green-600" />
                            <span className="text-xs text-muted-foreground">{r.paymentReference}</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedId(r.id); setPaymentDialogOpen(true) }}
                          >
                            Mark paid
                          </Button>
                        )}
                      </td>
                    )}
                    {isRecurringOrMultiDay ? (
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString("en-PH", {
                          month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
                        })}
                      </td>
                    ) : (
                      <td className="px-4 py-3 whitespace-nowrap">
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
        )}
      </div>

      {selectedId && (
        <PaymentDialog
          registrantId={selectedId}
          eventId={eventId}
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
        />
      )}

      <AddRegistrantDialog
        eventId={eventId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {importWizard}
    </div>
  )
}
