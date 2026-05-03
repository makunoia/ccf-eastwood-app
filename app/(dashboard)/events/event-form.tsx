"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DetailPageHeader } from "@/components/detail-page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import { MobileFormActions } from "@/components/mobile-form-actions"
import {
  defaultEventForm,
  type EventFormValues,
} from "@/lib/validations/event"
import { createEvent, updateEvent, deleteEvent } from "./actions"
import { type EventRow } from "./columns"

type Props = {
  ministries: { id: string; name: string }[]
  event?: EventRow
}

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function toFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    description: event.description ?? "",
    ministryIds: event.ministries.map((m) => m.id),
    type: event.type,
    startDate: event.startDate,
    endDate: event.endDate,
    price:
      event.price != null
        ? (event.price / 100).toFixed(2)
        : "",
    registrationStart: event.registrationStart ?? "",
    registrationEnd: event.registrationEnd ?? "",
    recurrenceDayOfWeek:
      event.recurrenceDayOfWeek != null
        ? String(event.recurrenceDayOfWeek)
        : "",
    recurrenceFrequency: event.recurrenceFrequency ?? "",
    recurrenceEndDate: event.recurrenceEndDate ?? "",
  }
}

export function EventForm({ ministries, event }: Props) {
  const router = useRouter()
  const isEdit = !!event
  const [form, setForm] = React.useState<EventFormValues>(
    () => event ? toFormValues(event) : defaultEventForm
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  const isRecurring = form.type === "Recurring"

  function set(field: keyof EventFormValues, value: string) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(event ? toFormValues(event) : defaultEventForm)
    setDirty(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    if (isEdit) {
      const result = await updateEvent(event!.id, form)
      setSaving(false)
      if (result.success) {
        setDirty(false)
        toast.success("Event updated")
        router.push(`/events/${event!.id}`)
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createEvent(form)
      setSaving(false)
      if (result.success) {
        toast.success("Event created")
        router.push(`/events/${result.data.id}`)
      } else {
        toast.error(result.error)
      }
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEvent(event!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Event deleted")
      router.push("/events")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-0">
      {isEdit && (
        <BreadcrumbOverride
          href={`/events/${event!.id}`}
          label={event!.name}
        />
      )}

      <DetailPageHeader
        title={isEdit ? "Edit Event" : "New Event"}
        subtitle={
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Update the event details below."
              : "Fill in the details to create a new event."}
          </p>
        }
        action={
          !isEdit ? (
            <Button type="submit" form="event-form" disabled={saving}>
              {saving ? "Creating…" : "Create event"}
            </Button>
          ) : dirty ? (
            <Button type="submit" form="event-form" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null
        }
      />

      <div className="p-6 pb-24 sm:pb-6">
        <form
          id="event-form"
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-8"
        >
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="type-label text-muted-foreground">
              Basic Information
            </h3>
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
              {ministries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ministries configured.</p>
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  {ministries.map((m) => (
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
              <Label htmlFor="type">
                Event Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => set("type", v)}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OneTime">One-time</SelectItem>
                  <SelectItem value="MultiDay">Multi-day</SelectItem>
                  <SelectItem value="Recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.type === "OneTime" && "Single-date event with optional registration and payment."}
                {form.type === "MultiDay" && "Spans consecutive days, treated as a date range."}
                {form.type === "Recurring" && "Repeats on a fixed schedule. First-timers register once; returning attendees check in per occurrence."}
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
            <h3 className="type-label text-muted-foreground">
              Event Dates
            </h3>
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
              <h3 className="type-label text-muted-foreground">
                Recurrence Settings
              </h3>
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
              <h3 className="type-label text-muted-foreground">
                Registration Window
              </h3>
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
              <h3 className="type-label text-muted-foreground">
                Pricing
              </h3>
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
        </form>

        {isEdit && (
          <div className="mt-12 max-w-2xl border-t pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Delete event</p>
                <p className="text-xs text-muted-foreground">
                  Permanently removes this record including all registrants and breakout groups. This cannot be undone.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={saving}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      {(!isEdit || dirty) && (
        <MobileFormActions
          formId="event-form"
          isEdit={isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save changes" : "Create event"}
          onRevert={handleRevert}
          onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{event?.name}</span>? This will
              also delete all registrants and breakout groups. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
