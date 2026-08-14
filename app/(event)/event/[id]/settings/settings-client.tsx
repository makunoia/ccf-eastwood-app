"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  enableModule,
  disableModule,
  setPricedModule,
  createBus,
  updateBus,
  deleteBus,
} from "@/app/(dashboard)/events/module-actions"
import { CommitteeManager } from "@/app/(dashboard)/events/[id]/committees"
import { LogoUploader } from "@/components/logo-uploader"
import { ColorThemePicker, type ColorTheme } from "@/components/color-theme-picker"
import { MinistryPicker, type MinistryOption } from "@/components/ministry-picker"
import { ModuleList, ModulePriceField } from "@/components/module-list"
import { updateEventBranding, type EventBrandingValues } from "@/app/(dashboard)/events/branding-actions"
import { updateEvent, deleteEvent } from "@/app/(dashboard)/events/actions"
import { type EventFormValues } from "@/lib/validations/event"
import { MODULE_LABELS, formatModuleList } from "@/lib/events/modules"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type BusRow = {
  id: string
  name: string
  capacity: number | null
  direction: string
  _count: { passengers: number }
}

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

type LinkedMinistry = {
  id: string
  name: string
  logoUrl: string | null
  themeColorPrimary: string | null
  themeColorSecondary: string | null
  themeColorAccent: string | null
}

type Props = {
  eventId: string
  eventType: EventType
  details: EventFormValues
  ministryOptions: MinistryOption[]
  enabledModules: EventModuleType[]
  /** Decimal string ("2500.00"), empty when the event is free. */
  price: string
  buses: BusRow[]
  committees: Committee[]
  branding: EventBrandingValues
  linkedMinistries: LinkedMinistry[]
}

type BusFormValues = { name: string; capacity: string; direction: string }
const defaultBusForm: BusFormValues = { name: "", capacity: "", direction: "ToVenue" }

const DIRECTION_LABELS: Record<string, string> = {
  ToVenue: "To Venue",
  FromVenue: "From Venue",
  Both: "Both ways",
}

// ─── Bus dialog ───────────────────────────────────────────────────────────────

function BusDialog({
  open,
  onOpenChange,
  eventId,
  bus,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  bus?: BusRow
}) {
  const isEdit = !!bus
  const [form, setForm] = React.useState<BusFormValues>(
    bus
      ? { name: bus.name, capacity: bus.capacity?.toString() ?? "", direction: bus.direction }
      : defaultBusForm
  )
  const [saving, setSaving] = React.useState(false)

  function set(field: keyof BusFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = isEdit
      ? await updateBus(bus!.id, eventId, form)
      : await createBus(eventId, form)
    setSaving(false)
    if (result.success) {
      toast.success(isEdit ? "Bus updated" : "Bus added")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bus" : "Add bus"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="busName">Name <span className="text-destructive">*</span></Label>
            <Input
              id="busName"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Bus 1"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="busCapacity">Capacity</Label>
            <Input
              id="busCapacity"
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              placeholder="Leave blank for unlimited"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="busDirection">Direction</Label>
            <Select value={form.direction} onValueChange={(v) => set("direction", v)}>
              <SelectTrigger id="busDirection"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ToVenue">To Venue</SelectItem>
                <SelectItem value="FromVenue">From Venue</SelectItem>
                <SelectItem value="Both">Both ways</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add bus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Branding tab ─────────────────────────────────────────────────────────────

function BrandingTab({
  eventId,
  initial,
  linkedMinistries,
}: {
  eventId: string
  initial: EventBrandingValues
  linkedMinistries: LinkedMinistry[]
}) {
  const [form, setForm] = React.useState<EventBrandingValues>(initial)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  function set<K extends keyof EventBrandingValues>(key: K, value: EventBrandingValues[K]) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const selectedMinistry = linkedMinistries.find((m) => m.id === form.brandMinistryId)

  const colorTheme: ColorTheme = {
    primary: form.themeColorPrimary,
    secondary: form.themeColorSecondary,
    accent: form.themeColorAccent,
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateEventBranding(eventId, form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Branding saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Use Ministry Brand</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inherit logo and color theme from a linked ministry.
          </p>
        </div>
        <Switch
          checked={form.useMinistryBrand}
          onCheckedChange={(v) => set("useMinistryBrand", v)}
        />
      </div>

      {form.useMinistryBrand ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ministry</Label>
            {linkedMinistries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ministries linked to this event. Link one in Event Settings → Details first.
              </p>
            ) : (
              <Select
                value={form.brandMinistryId}
                onValueChange={(v) => set("brandMinistryId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a ministry" />
                </SelectTrigger>
                <SelectContent>
                  {linkedMinistries.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedMinistry && (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
              <div className="flex items-center gap-3">
                {selectedMinistry.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedMinistry.logoUrl}
                    alt={selectedMinistry.name}
                    className="size-12 rounded-lg object-contain border bg-muted p-0.5"
                  />
                ) : (
                  <div className="size-12 rounded-lg border bg-muted flex items-center justify-center text-xs text-foreground/60">
                    No logo
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{selectedMinistry.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {[selectedMinistry.themeColorPrimary, selectedMinistry.themeColorSecondary, selectedMinistry.themeColorAccent]
                      .filter(Boolean)
                      .map((color, i) => (
                        <div
                          key={i}
                          className="size-4 rounded-full border"
                          style={{ backgroundColor: color! }}
                          title={color!}
                        />
                      ))}
                    {!selectedMinistry.themeColorPrimary && (
                      <p className="text-xs text-muted-foreground">No theme colors set</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <LogoUploader
            value={form.logoUrl || null}
            onChange={(url) => {
              setDirty(true)
              setForm((prev) => ({ ...prev, logoUrl: url ?? "" }))
            }}
          />
          <ColorThemePicker
            value={colorTheme}
            onChange={(theme) => {
              setDirty(true)
              setForm((prev) => ({
                ...prev,
                themeColorPrimary: theme.primary,
                themeColorSecondary: theme.secondary,
                themeColorAccent: theme.accent,
              }))
            }}
          />
        </div>
      )}

      {dirty && (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </Button>
      )}
    </div>
  )
}

// ─── Details tab ──────────────────────────────────────────────────────────────

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function DetailsTab({
  eventId,
  initial,
  ministryOptions,
}: {
  eventId: string
  initial: EventFormValues
  ministryOptions: MinistryOption[]
}) {
  const [form, setForm] = React.useState<EventFormValues>(initial)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  const isRecurring = form.type === "Recurring"

  function set(field: keyof EventFormValues, value: string) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await updateEvent(eventId, form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Event updated")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-8">
      {/* Basic Info */}
      <section className="space-y-4">
        <h3 className="type-label text-muted-foreground">Basic Information</h3>
        <div className="space-y-2">
          <Label htmlFor="name">
            Event Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Family Camp 2026"
            required
          />
        </div>

        <MinistryPicker
          ministries={ministryOptions}
          selectedIds={form.ministryIds}
          allMinistries={form.allMinistries}
          onChange={(next) => {
            setDirty(true)
            setForm((prev) => ({ ...prev, ...next }))
          }}
        />

        <div className="space-y-2">
          <Label htmlFor="type">Event Type</Label>
          <Select value={form.type} disabled>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OneTime">One-time</SelectItem>
              <SelectItem value="MultiDay">Multi-day</SelectItem>
              <SelectItem value="Recurring">Recurring</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Event type is set at creation and can&apos;t be changed afterwards.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="A brief description of the event…"
            rows={3}
          />
        </div>
      </section>

      {/* Dates */}
      <section className="space-y-4">
        <h3 className="type-label text-muted-foreground">Event Dates</h3>
        {form.type === "MultiDay" ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="startDate">
              {isRecurring ? "Series Start Date" : "Date"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              required
            />
          </div>
        )}
      </section>

      {/* Recurring Settings */}
      {isRecurring && (
        <section className="space-y-4">
          <h3 className="type-label text-muted-foreground">Recurrence Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recurrenceDayOfWeek">
                Day of Week <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.recurrenceDayOfWeek}
                onValueChange={(v) => set("recurrenceDayOfWeek", v)}
              >
                <SelectTrigger id="recurrenceDayOfWeek">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OF_WEEK_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrenceFrequency">
                Frequency <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.recurrenceFrequency}
                onValueChange={(v) => set("recurrenceFrequency", v)}
              >
                <SelectTrigger id="recurrenceFrequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Biweekly">Biweekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurrenceEndDate">End Date</Label>
            <Input
              id="recurrenceEndDate"
              type="date"
              value={form.recurrenceEndDate}
              onChange={(e) => set("recurrenceEndDate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if the series runs indefinitely.
            </p>
          </div>
        </section>
      )}

      {/* Pricing lives with the Priced Event module, and the registration window
          with the form it governs — see the Modules tab and Forms → Registration
          Form. Keeping them out of this form is also what stops a Details save
          from overwriting settings this screen no longer shows. */}

      {dirty && (
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EventSettingsClient({
  eventId,
  eventType,
  details,
  ministryOptions,
  enabledModules,
  price,
  buses,
  committees,
  branding,
  linkedMinistries,
}: Props) {
  // Tabs are controlled by the `tab` search param so other screens (e.g. the
  // dashboard setup checklist) can deep-link straight to a section.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [modules, setModules] = React.useState<EventModuleType[]>(enabledModules)
  const [togglingModule, setTogglingModule] = React.useState<string | null>(null)

  const hasVolunteers = modules.includes("Volunteers")

  // Committees exist only to organise volunteers, so the tab goes with the module.
  const validTabs = [
    "details",
    "modules",
    ...(hasVolunteers ? ["committees"] : []),
    "branding",
    "danger-zone",
  ]
  const tabParam = searchParams.get("tab")
  const activeTab = tabParam && validTabs.includes(tabParam) ? tabParam : "details"

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams)
    params.set("tab", value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const [priceInput, setPriceInput] = React.useState(price)
  const [priceDirty, setPriceDirty] = React.useState(false)
  const [savingPrice, setSavingPrice] = React.useState(false)
  const [busDialogOpen, setBusDialogOpen] = React.useState(false)
  const [editingBus, setEditingBus] = React.useState<BusRow | undefined>()
  const [deletingBusId, setDeletingBusId] = React.useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [busToDelete, setBusToDelete] = React.useState<BusRow | undefined>()
  const [confirmEventName, setConfirmEventName] = React.useState("")
  const [deletingEvent, setDeletingEvent] = React.useState(false)

  async function handleToggleModule(type: EventModuleType) {
    setTogglingModule(type)
    const isEnabled = modules.includes(type)

    if (isEnabled) {
      const result = await disableModule(eventId, type)
      setTogglingModule(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setModules((prev) => prev.filter((m) => m !== type))
      if (type === "Priced") setPriceInput("")
      return
    }

    const result = await enableModule(eventId, type)
    setTogglingModule(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    // The server may have enabled requirements alongside the target — mirror
    // exactly what it did rather than assuming only `type` changed.
    setModules((prev) => [...new Set([...prev, ...result.data.enabled])])
    const alsoEnabled = result.data.enabled.filter((m) => m !== type)
    if (alsoEnabled.length > 0) {
      toast.success(
        `${MODULE_LABELS[type]} needs ${formatModuleList(alsoEnabled)} — turned ${
          alsoEnabled.length > 1 ? "those" : "that"
        } on too.`
      )
    }
  }

  async function handleSavePrice() {
    setSavingPrice(true)
    const result = await setPricedModule(eventId, priceInput)
    setSavingPrice(false)
    if (result.success) {
      setModules((prev) => [...new Set([...prev, "Priced" as EventModuleType])])
      setPriceDirty(false)
      toast.success("Price saved")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDeleteEvent() {
    setDeletingEvent(true)
    const result = await deleteEvent(eventId)
    setDeletingEvent(false)
    if (result.success) {
      router.push("/events")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDeleteBus() {
    if (!busToDelete) return
    setDeletingBusId(busToDelete.id)
    const result = await deleteBus(busToDelete.id, eventId)
    setDeletingBusId(null)
    if (result.success) {
      toast.success("Bus deleted")
      setDeleteDialogOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Settings"
        description="Configure modules and options for this event"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          {hasVolunteers && <TabsTrigger value="committees">Committees</TabsTrigger>}
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="danger-zone" className="text-destructive data-[state=active]:text-destructive">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <DetailsTab eventId={eventId} initial={details} ministryOptions={ministryOptions} />
        </TabsContent>

        <TabsContent value="modules" className="mt-6">
          <section className="max-w-2xl space-y-4">
            <div>
              <h3 className="text-sm font-medium">Modules</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                What this event uses. The sidebar, the setup steps, and what the
                registration form collects all follow from these.
              </p>
            </div>

            <ModuleList
              eventType={eventType}
              enabled={modules}
              busy={togglingModule}
              onToggle={handleToggleModule}
              rows={{
                Priced: (
                  <ModulePriceField
                    id="module-price"
                    value={priceInput}
                    onChange={(next) => {
                      setPriceDirty(true)
                      setPriceInput(next)
                    }}
                    hint="Turn the module off to make the event free again."
                    action={
                      <Button
                        size="sm"
                        onClick={handleSavePrice}
                        disabled={!priceDirty || savingPrice}
                      >
                        {savingPrice ? "Saving…" : "Save"}
                      </Button>
                    }
                  />
                ),
                Embarkation: (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {buses.length === 0
                          ? "No buses yet"
                          : `${buses.length} ${buses.length === 1 ? "bus" : "buses"}`}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingBus(undefined)
                          setBusDialogOpen(true)
                        }}
                      >
                        <IconPlus className="mr-1 size-3.5" />
                        Add bus
                      </Button>
                    </div>
                    {buses.length > 0 && (
                      // Flat divided list, not a bordered box: this already sits
                      // inside the module container, and a box in a box reads as
                      // nested cards.
                      <div className="divide-y border-t">
                        {buses.map((bus) => (
                          <div
                            key={bus.id}
                            className="flex items-center justify-between gap-2 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{bus.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {DIRECTION_LABELS[bus.direction]} ·{" "}
                                {bus._count.passengers} assigned
                                {bus.capacity != null && ` / ${bus.capacity}`}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                aria-label={`Edit ${bus.name}`}
                                onClick={() => {
                                  setEditingBus(bus)
                                  setBusDialogOpen(true)
                                }}
                              >
                                <IconPencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                aria-label={`Delete ${bus.name}`}
                                onClick={() => {
                                  setBusToDelete(bus)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <IconTrash className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              }}
            />
          </section>
        </TabsContent>

        {hasVolunteers && (
          <TabsContent value="committees" className="mt-6 max-w-2xl">
            <CommitteeManager eventId={eventId} committees={committees} />
          </TabsContent>
        )}

        <TabsContent value="branding" className="mt-6">
          <BrandingTab
            eventId={eventId}
            initial={branding}
            linkedMinistries={linkedMinistries}
          />
        </TabsContent>

        <TabsContent value="danger-zone" className="mt-6">
          <div className="max-w-2xl space-y-4 rounded-lg border border-destructive/40 p-6">
            <div>
              <h3 className="font-semibold text-destructive">Delete Event</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This will permanently delete the event and all associated data — registrants,
                sessions, breakout groups, and more. This action cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmEventName">
                Type <span className="font-medium text-foreground">{details.name}</span> to confirm
              </Label>
              <Input
                id="confirmEventName"
                value={confirmEventName}
                onChange={(e) => setConfirmEventName(e.target.value)}
                placeholder={details.name}
              />
            </div>
            <Button
              variant="destructive"
              disabled={confirmEventName !== details.name || deletingEvent}
              onClick={handleDeleteEvent}
            >
              {deletingEvent ? "Deleting…" : "Delete this event"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <BusDialog
        open={busDialogOpen}
        onOpenChange={setBusDialogOpen}
        eventId={eventId}
        bus={editingBus}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bus</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{busToDelete?.name}</span>?
            All passenger assignments will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={!!deletingBusId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBus} disabled={!!deletingBusId}>
              {deletingBusId ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
