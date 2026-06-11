"use client"

import * as React from "react"
import { IconBus, IconCash, IconCross, IconFish, IconPencil, IconPlus, IconSalad, IconSparkles, IconTrash, IconUsers } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  createBus,
  updateBus,
  deleteBus,
  setRegistrationFormModule,
  type RegistrationFormModule,
} from "@/app/(dashboard)/events/module-actions"
import { CommitteeManager } from "@/app/(dashboard)/events/[id]/committees"
import { LogoUploader } from "@/components/logo-uploader"
import { ColorThemePicker, type ColorTheme } from "@/components/color-theme-picker"
import { updateEventBranding, type EventBrandingValues } from "@/app/(dashboard)/events/branding-actions"
import { updateRegistrationPage, type RegistrationPageValues } from "@/app/(dashboard)/events/registration-page-actions"
import { updateEvent } from "@/app/(dashboard)/events/actions"
import { type EventFormValues } from "@/lib/validations/event"
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

type FormModules = Record<RegistrationFormModule, boolean>

type Props = {
  eventId: string
  details: EventFormValues
  allMinistries: { id: string; name: string }[]
  enabledModules: string[]
  buses: BusRow[]
  committees: Committee[]
  showEmbarkation: boolean
  branding: EventBrandingValues
  formModules: FormModules
  linkedMinistries: LinkedMinistry[]
  registrationPage: RegistrationPageValues
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
                  <div className="size-12 rounded-lg border bg-muted flex items-center justify-center text-xs text-muted-foreground">
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

// ─── Registration page tab ────────────────────────────────────────────────────

function RegistrationPageTab({
  eventId,
  initial,
}: {
  eventId: string
  initial: RegistrationPageValues
}) {
  const [form, setForm] = React.useState<RegistrationPageValues>(initial)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  function set<K extends keyof RegistrationPageValues>(key: K, value: RegistrationPageValues[K]) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateRegistrationPage(eventId, form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success("Page settings saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs text-muted-foreground">
          Customize the header shown on this event&apos;s public registration and check-in pages. Leave a field blank to use the default.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="regPageTitle">Page Title</Label>
        <Input
          id="regPageTitle"
          value={form.registrationPageTitle}
          onChange={(e) => set("registrationPageTitle", e.target.value)}
          placeholder="e.g. Youth Camp 2026 — Sign Up"
        />
        <p className="text-xs text-muted-foreground">
          Defaults to &ldquo;[Event Name] Registration&rdquo; when blank.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="regPageDescription">Description</Label>
        <Textarea
          id="regPageDescription"
          value={form.registrationPageDescription}
          onChange={(e) => set("registrationPageDescription", e.target.value)}
          placeholder="e.g. Fill in your details below to secure your slot."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Shown below the title. Defaults to the ministry and date when blank.
        </p>
      </div>

      <div className="space-y-2">
        <LogoUploader
          label="Banner Image"
          value={form.registrationPageBannerUrl || null}
          onChange={(url) => {
            setDirty(true)
            setForm((prev) => ({ ...prev, registrationPageBannerUrl: url ?? "" }))
          }}
        />
        <p className="text-xs text-muted-foreground">
          Full-cover background behind the header. Leave blank to use the event&apos;s branding color.
        </p>
      </div>

      {dirty && (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save page settings"}
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
  allMinistries,
}: {
  eventId: string
  initial: EventFormValues
  allMinistries: { id: string; name: string }[]
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

        <div className="space-y-2">
          <Label>Ministry</Label>
          <p className="text-xs text-muted-foreground">
            Select one or more ministries, or leave blank for a ministry-agnostic event.
          </p>
          {allMinistries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ministries configured.</p>
          ) : (
            <div className="space-y-2 rounded-md border p-3">
              {allMinistries.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`ministry-${m.id}`}
                    checked={form.ministryIds.includes(m.id)}
                    onCheckedChange={(checked) => {
                      setDirty(true)
                      setForm((prev) => ({
                        ...prev,
                        ministryIds: checked
                          ? [...prev.ministryIds, m.id]
                          : prev.ministryIds.filter((id) => id !== m.id),
                      }))
                    }}
                  />
                  <label
                    htmlFor={`ministry-${m.id}`}
                    className="text-sm leading-none cursor-pointer"
                  >
                    {m.name}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

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

      {/* Registration — not applicable for Recurring events */}
      {!isRecurring && (
        <section className="space-y-4">
          <h3 className="type-label text-muted-foreground">Registration Window</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registrationStart">Opens</Label>
              <Input
                id="registrationStart"
                type="date"
                value={form.registrationStart}
                onChange={(e) => set("registrationStart", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registrationEnd">Closes</Label>
              <Input
                id="registrationEnd"
                type="date"
                value={form.registrationEnd}
                onChange={(e) => set("registrationEnd", e.target.value)}
              />
            </div>
          </div>
        </section>
      )}

      {/* Pricing — not applicable for Recurring events */}
      {!isRecurring && (
        <section className="space-y-4">
          <h3 className="type-label text-muted-foreground">Pricing</h3>
          <div className="space-y-2">
            <Label htmlFor="price">Price (PHP)</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="Leave blank for free"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if the event is free.
            </p>
          </div>
        </section>
      )}

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
  details,
  allMinistries,
  enabledModules,
  buses,
  committees,
  showEmbarkation,
  branding,
  formModules,
  linkedMinistries,
  registrationPage,
}: Props) {
  const [modules, setModules] = React.useState<Set<string>>(new Set(enabledModules))
  const [togglingModule, setTogglingModule] = React.useState<string | null>(null)
  const [formMods, setFormMods] = React.useState<FormModules>(formModules)
  const [togglingFormModule, setTogglingFormModule] = React.useState<RegistrationFormModule | null>(null)

  async function handleToggleFormModule(module: RegistrationFormModule) {
    const next = !formMods[module]
    setTogglingFormModule(module)
    const result = await setRegistrationFormModule(eventId, module, next)
    setTogglingFormModule(null)
    if (result.success) {
      setFormMods((prev) => ({ ...prev, [module]: next }))
    } else {
      toast.error(result.error)
    }
  }
  const [busDialogOpen, setBusDialogOpen] = React.useState(false)
  const [editingBus, setEditingBus] = React.useState<BusRow | undefined>()
  const [deletingBusId, setDeletingBusId] = React.useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [busToDelete, setBusToDelete] = React.useState<BusRow | undefined>()

  async function handleToggleModule(type: string) {
    setTogglingModule(type)
    const enabled = modules.has(type)
    const result = enabled
      ? await disableModule(eventId, type as "Baptism" | "Embarkation" | "CatchMech")
      : await enableModule(eventId, type as "Baptism" | "Embarkation" | "CatchMech")
    setTogglingModule(null)
    if (result.success) {
      setModules((prev) => {
        const next = new Set(prev)
        if (enabled) { next.delete(type) } else { next.add(type) }
        return next
      })
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

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="registration-form">Registration Form</TabsTrigger>
          <TabsTrigger value="registration-page">Registration & Check-in Page</TabsTrigger>
          <TabsTrigger value="committees">Committees</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <DetailsTab eventId={eventId} initial={details} allMinistries={allMinistries} />
        </TabsContent>

        <TabsContent value="modules" className="mt-6">
          <section className="space-y-4 max-w-2xl">
            <h3 className="type-label text-muted-foreground">Add-on Modules</h3>

            {/* Baptism */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconCross className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Baptism</CardTitle>
                      <CardDescription className="mt-0.5">
                        Track registrants who will be baptized at this event. Managed mid-event by admin.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={modules.has("Baptism")}
                    onCheckedChange={() => handleToggleModule("Baptism")}
                    disabled={togglingModule === "Baptism"}
                  />
                </div>
              </CardHeader>
            </Card>

            {/* Embarkation — only for OneTime/MultiDay */}
            {showEmbarkation && (
              <Card>
                <CardHeader className={modules.has("Embarkation") ? "p-4 pb-2" : "p-4"}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <IconBus className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <CardTitle className="text-base">Embarkation</CardTitle>
                        <CardDescription className="mt-0.5">
                          Assign registrants and volunteers to buses. Print a manifest per bus.
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      className="shrink-0"
                      checked={modules.has("Embarkation")}
                      onCheckedChange={() => handleToggleModule("Embarkation")}
                      disabled={togglingModule === "Embarkation"}
                    />
                  </div>
                </CardHeader>

                {modules.has("Embarkation") && (
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Buses</p>
                      <Button size="sm" variant="outline" onClick={() => { setEditingBus(undefined); setBusDialogOpen(true) }}>
                        <IconPlus className="mr-1 size-3.5" />
                        Add bus
                      </Button>
                    </div>
                    {buses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No buses added yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {buses.map((bus) => (
                          <div
                            key={bus.id}
                            className="flex items-center justify-between rounded-lg border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{bus.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {DIRECTION_LABELS[bus.direction]} ·{" "}
                                {bus._count.passengers} assigned
                                {bus.capacity != null && ` / ${bus.capacity}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => { setEditingBus(bus); setBusDialogOpen(true) }}
                              >
                                <IconPencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => { setBusToDelete(bus); setDeleteDialogOpen(true) }}
                              >
                                <IconTrash className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}
            {/* Catch Mech */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconFish className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Catch Mech</CardTitle>
                      <CardDescription className="mt-0.5">
                        Enable facilitators to confirm breakout group members into their small groups via a weekly link.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={modules.has("CatchMech")}
                    onCheckedChange={() => handleToggleModule("CatchMech")}
                    disabled={togglingModule === "CatchMech"}
                  />
                </div>
              </CardHeader>
            </Card>

            <h3 className="type-label text-muted-foreground pt-2">Volunteer Tools</h3>

            {/* Volunteer Info Form */}
            <Card>
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconUsers className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Volunteer Info Form</CardTitle>
                      <CardDescription className="mt-0.5">
                        Share this link with volunteers so they can update their personal info, small group membership, and availability.
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <VolunteerInfoUrlCopier eventId={eventId} />
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="registration-form" className="mt-6">
          <section className="space-y-4 max-w-2xl">
            <div>
              <h3 className="type-label text-muted-foreground">Public registration form</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Toggle which optional sections appear on this event&apos;s public registration form.
              </p>
            </div>

            {/* Small Group */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconUsers className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Small Group</CardTitle>
                      <CardDescription className="mt-0.5">
                        Collect matching preferences so registrants can be placed into a Small Group or Breakout.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={formMods.SmallGroup}
                    onCheckedChange={() => handleToggleFormModule("SmallGroup")}
                    disabled={togglingFormModule === "SmallGroup"}
                  />
                </div>
              </CardHeader>
            </Card>

            {/* Dietary Restrictions */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconSalad className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Dietary Restrictions</CardTitle>
                      <CardDescription className="mt-0.5">
                        Ask registrants whether they have dietary preferences (Vegetarian, Vegan, Halal, etc.).
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={formMods.Dietary}
                    onCheckedChange={() => handleToggleFormModule("Dietary")}
                    disabled={togglingFormModule === "Dietary"}
                  />
                </div>
              </CardHeader>
            </Card>

            {/* Payment */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconCash className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Payment Reference</CardTitle>
                      <CardDescription className="mt-0.5">
                        Ask registrants for a payment reference (e.g. GCash transaction ID) on submission.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={formMods.Payment}
                    onCheckedChange={() => handleToggleFormModule("Payment")}
                    disabled={togglingFormModule === "Payment"}
                  />
                </div>
              </CardHeader>
            </Card>

            {/* Auto-assign Breakout */}
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconSparkles className="size-6 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base">Automatically assign breakout groups</CardTitle>
                      <CardDescription className="mt-0.5">
                        On submit, place each registrant into the best-fit breakout group based on Gender, Age, and remaining capacity. When off, registrants choose their own group (or skip).
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={formMods.AutoAssignBreakout}
                    onCheckedChange={() => handleToggleFormModule("AutoAssignBreakout")}
                    disabled={togglingFormModule === "AutoAssignBreakout"}
                  />
                </div>
              </CardHeader>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="registration-page" className="mt-6">
          <RegistrationPageTab eventId={eventId} initial={registrationPage} />
        </TabsContent>

        <TabsContent value="committees" className="mt-6 max-w-2xl">
          <CommitteeManager eventId={eventId} committees={committees} />
        </TabsContent>

        <TabsContent value="branding" className="mt-6">
          <BrandingTab
            eventId={eventId}
            initial={branding}
            linkedMinistries={linkedMinistries}
          />
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

function VolunteerInfoUrlCopier({ eventId }: { eventId: string }) {
  const [copied, setCopied] = React.useState(false)

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${eventId}/volunteer-info`
      : `/events/${eventId}/volunteer-info`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="text-xs text-muted-foreground" />
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  )
}
