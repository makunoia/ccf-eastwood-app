"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  IconCheck,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconPlus,
  IconUpload,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import {
  buildRegistrantColumns,
  type RegistrantRow,
  registrantEmail,
  registrantMobile,
  registrantName,
} from "./columns"
import { Checkbox } from "@/components/ui/checkbox"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { RegistrantsBatchBar } from "./registrants-batch-bar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { OptionalPhonePHInput } from "@/components/ui/optional-phone-ph-input"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { PageActions, PageHeader, type PageAction } from "@/components/page-header"
import { ImportWizard } from "@/components/import/import-wizard"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { getEventRegistrantFields } from "@/lib/import/field-definitions"
import { exportEventRegistrationsCSV } from "@/lib/export-entities"
import { exportFilename } from "@/lib/exports/filename"
import {
  EVENT_EXPORT_GROUPS,
  type EventExportGroup,
  type EventRegistrationExportRow,
} from "@/lib/exports/event-registrations"
import type { EventType } from "@/app/generated/prisma/client"
import { getEventRegistrationsExport } from "./export-actions"
import {
  markRegistrantAttended,
  markRegistrantPaid,
  unmarkRegistrantAttended,
} from "@/app/(dashboard)/events/actions"
import {
  addEventRegistrant,
  addExistingRegistrant,
  checkRegistrantDuplicates,
  importEventRegistrants,
  searchPeopleForRegistration,
} from "./import-actions"

// ─── Types ────────────────────────────────────────────────────────────────────

// The row shape lives with the columns that render it.
type Registrant = RegistrantRow

// ─── Helpers ──────────────────────────────────────────────────────────────────

// The card view below and the table columns must agree on how a registrant's
// name and contact details are resolved; both read these.
const displayName = registrantName
const displayMobile = registrantMobile
const displayEmail = registrantEmail


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

type PersonResult = {
  recordType: "member" | "guest"
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  alreadyRegistered: boolean
}

function AddRegistrantDialog({
  eventId, open, onOpenChange,
}: { eventId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  // New-person tab state
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName]   = React.useState("")
  const [email, setEmail]         = React.useState("")
  const [mobile, setMobile]       = React.useState("")
  const [noMobile, setNoMobile]   = React.useState(false)
  const [noEmail, setNoEmail]     = React.useState(false)
  const [nickname, setNickname]   = React.useState("")
  const [saving, setSaving]       = React.useState(false)
  // Existing-person tab state
  const [query, setQuery]         = React.useState("")
  const [results, setResults]     = React.useState<PersonResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState("")
  const [addingExisting, setAddingExisting] = React.useState(false)

  function reset() {
    setFirstName(""); setLastName(""); setEmail(""); setMobile(""); setNickname("")
    setNoMobile(false); setNoEmail(false)
    setQuery(""); setResults([]); setSelectedId(""); setSearching(false); setAddingExisting(false)
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

  async function handleSearch(q: string) {
    setQuery(q)
    setSelectedId("")
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const result = await searchPeopleForRegistration(eventId, q)
    setSearching(false)
    if (result.success) setResults(result.data)
  }

  async function handleAddExisting() {
    const selected = results.find((r) => r.id === selectedId)
    if (!selected) return
    setAddingExisting(true)
    const result = await addExistingRegistrant(eventId, {
      recordType: selected.recordType,
      recordId: selected.id,
    })
    setAddingExisting(false)
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
        <Tabs defaultValue="new">
          <TabsList className="w-full">
            <TabsTrigger value="new" className="flex-1">New person</TabsTrigger>
            <TabsTrigger value="existing" className="flex-1">Existing person</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="add-first">First Name *</Label>
                  <Input id="add-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
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
                <OptionalPhonePHInput id="add-mobile" value={mobile} onChange={setMobile} noNumber={noMobile} onNoNumberChange={setNoMobile} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email</Label>
                <OptionalEmailInput id="add-email" value={email} onChange={(e) => setEmail(e.target.value)} noEmail={noEmail} onNoEmailChange={setNoEmail} />
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
          </TabsContent>

          <TabsContent value="existing" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-search">Search Members &amp; Guests</Label>
              <Input
                id="add-search"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name, phone, or email…"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {query.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : searching ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches found.</p>
              ) : (
                <ul className="divide-y">
                  {results.map((r) => {
                    const selected = r.id === selectedId
                    const hint = r.phone ?? r.email ?? undefined
                    return (
                      <li key={`${r.recordType}-${r.id}`}>
                        <button
                          type="button"
                          disabled={r.alreadyRegistered}
                          onClick={() => setSelectedId(r.id)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected ? "bg-accent" : "hover:bg-accent/50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{r.firstName} {r.lastName}</span>
                              <Badge variant="outline" className="shrink-0 capitalize">{r.recordType}</Badge>
                            </span>
                            {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
                          </span>
                          {r.alreadyRegistered ? (
                            <span className="shrink-0 text-xs text-muted-foreground">Already registered</span>
                          ) : selected ? (
                            <IconCheck className="size-4 shrink-0" />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={addingExisting}>
                Cancel
              </Button>
              <Button type="button" onClick={handleAddExisting} disabled={!selectedId || addingExisting}>
                {addingExisting ? "Adding…" : "Add Registrant"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function RegistrantCard({
  r, eventId, isRecurringOrMultiDay, isPaidEvent,
  onMarkPaid, onToggleAttendance, toggling, onNavigate,
}: {
  r: Registrant
  eventId: string
  isRecurringOrMultiDay: boolean
  isPaidEvent: boolean
  onMarkPaid: (id: string) => void
  onToggleAttendance: (r: Registrant) => void
  toggling: string | null
  onNavigate: () => void
}) {
  const router = useRouter()
  const selection = useBatchSelection()
  const selecting = selection?.enabled && selection.selectMode
  const checked = selection?.isSelected(r.id) ?? false

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-0 data-[selected=true]:border-primary"
      data-selected={checked}
      onClick={() => {
        if (selecting) {
          selection?.toggle(r.id)
          return
        }
        onNavigate()
        router.push(`/event/${eventId}/registrants/${r.id}`)
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            {selecting && (
              <Checkbox
                checked={checked}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => selection?.toggle(r.id)}
                aria-label={`Select ${displayName(r) ?? "registrant"}`}
                className="mt-0.5"
              />
            )}
            <p className="font-medium leading-tight">
              {displayName(r) ?? <span className="text-muted-foreground italic">No name</span>}
            </p>
          </div>
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
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search registrants..."
      onSearch={(value) => setFilter("search", value)}
      activeCount={typeFilter ? 1 : 0}
      hasActive={Boolean(hasFilters)}
      onClear={() => router.replace(pathname)}
    >
      <FilterField label="Type">
        <Select
          value={typeFilter || "all"}
          onValueChange={(v) => setFilter("type", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="guest">Guests</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
    </FilterBar>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

type Props = {
  eventId: string
  eventName: string
  eventType: EventType
  isPaidEvent: boolean
  formIncludePayment: boolean
  canExport: boolean
  search: string
  typeFilter: string
  registrants: Registrant[]
}

export function RegistrantsClient({
  eventId, eventName, eventType, isPaidEvent, formIncludePayment, canExport,
  search, typeFilter, registrants,
}: Props) {
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [addDialogOpen, setAddDialogOpen]         = React.useState(false)
  const [selectedId, setSelectedId]               = React.useState<string | null>(null)
  const [togglingAttendance, setTogglingAttendance] = React.useState<string | null>(null)
  const [importOpen, setImportOpen]               = React.useState(false)

  const selection = useBatchSelection()
  const selectable = selection?.enabled ?? false

  const isRecurringOrMultiDay = eventType === "Recurring" || eventType === "MultiDay"

  // Memoised because the column set depends on it; without this the columns
  // would be rebuilt on every render and the table would lose its state.
  const saveRegistrantIds = React.useCallback(() => {
    sessionStorage.setItem("registrantListIds", JSON.stringify(registrants.map((r) => r.id)))
  }, [registrants])

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
      config={{
        entity: "event-registrant",
        fields: getEventRegistrantFields({ includePaymentReference: formIncludePayment }),
        useExistingEnriches: true,
        detectSharedContacts: true,
        context: { eventId },
      }}
      open={importOpen}
      onOpenChange={setImportOpen}
      onCheckDuplicates={(rows) => checkRegistrantDuplicates(eventId, rows)}
      onImport={(rows) => importEventRegistrants(eventId, rows)}
    />
  )

  // The dialog fetches the full registrant list itself: the export describes the
  // event, not whatever the search box currently narrows it to.
  const { open: openExport, dialog: exportDialog } = useExportColumnsDialog<
    EventRegistrationExportRow,
    EventExportGroup
  >({
    title: "Export registrants",
    description:
      "Everything this event's registration forms collected, plus its check-in record. One row per registration.",
    groups: EVENT_EXPORT_GROUPS,
    unit: ["registrant", "registrants"],
    emptyMessage: "No registrants to export yet.",
    loadingMessage: "Gathering registrants…",
    load: () => getEventRegistrationsExport(eventId),
    download: (rows, selected) =>
      exportEventRegistrationsCSV(
        exportFilename(eventName, "registrants"),
        rows,
        selected,
        eventType,
      ),
  })

  const columns = React.useMemo(
    () =>
      buildRegistrantColumns({
        eventId,
        selectable,
        isRecurringOrMultiDay,
        isPaidEvent,
        onSaveIds: saveRegistrantIds,
        onMarkPaid: (id) => {
          setSelectedId(id)
          setPaymentDialogOpen(true)
        },
      }),
    [eventId, selectable, isRecurringOrMultiDay, isPaidEvent, saveRegistrantIds],
  )

  const toolbarActions: PageAction[] = [
    {
      label: "Import",
      icon: <IconUpload className="size-4" />,
      onSelect: () => setImportOpen(true),
      overflow: true,
    },
    ...(canExport
      ? [
          {
            label: "Export",
            icon: <IconDownload className="size-4" />,
            onSelect: openExport,
            overflow: true,
          } satisfies PageAction,
        ]
      : []),
    {
      label: "Registration page",
      icon: <IconExternalLink className="size-4" />,
      href: `/events/${eventId}/register`,
      newTab: true,
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* Header */}
      <PageHeader
        title="Registrants"
        description={`${registrants.length} shown`}
        actions={
          <RegistrantsBatchBar eventId={eventId} canMarkAttendance={!isRecurringOrMultiDay}>
            <PageActions
              primary={{
                label: "Add",
                icon: <IconPlus className="size-4" />,
                onSelect: () => setAddDialogOpen(true),
              }}
              actions={toolbarActions}
            />
          </RegistrantsBatchBar>
        }
      />

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
              onNavigate={saveRegistrantIds}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          tableKey="event.registrants"
          rowLabel={{ one: "registrant", many: "registrants" }}
          columns={columns}
          data={registrants}
          emptyState={
            <>
              <IconClock className="size-8" />
              <p className="text-sm">
                {search || typeFilter ? "No registrants match your search" : "No registrants yet"}
              </p>
            </>
          }
        />
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
      {exportDialog}
    </div>
  )
}
