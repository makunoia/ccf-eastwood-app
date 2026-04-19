"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { toast } from "sonner"

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

  const isRecurring = form.type === "Recurring"

  function set(field: keyof EventFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(event ? toFormValues(event) : defaultEventForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    if (isEdit) {
      const result = await updateEvent(event!.id, form)
      setSaving(false)
      if (result.success) {
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
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
      <div>
        <Link
          href={isEdit ? `/events/${event!.id}` : "/events"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          {isEdit ? event!.name : "Events"}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? "Edit Event" : "New Event"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Update the event details below."
              : "Fill in the details to create a new event."}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          <Button type="submit" form="event-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create event"}
          </Button>
        </div>
      </div>

      <form
        id="event-form"
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-8"
      >
        {/* Basic Info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
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
          <h3 className="text-sm font-medium text-muted-foreground">
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
            <h3 className="text-sm font-medium text-muted-foreground">
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
            <h3 className="text-sm font-medium text-muted-foreground">
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
            <h3 className="text-sm font-medium text-muted-foreground">
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

      <MobileFormActions
        formId="event-form"
        isEdit={isEdit}
        saving={saving}
        saveLabel={isEdit ? "Save changes" : "Create event"}
        onRevert={handleRevert}
        onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
      />

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
