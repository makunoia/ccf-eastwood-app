"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { toast } from "sonner"

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

function toFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    description: event.description ?? "",
    ministryId: event.ministryId,
    startDate: event.startDate,
    endDate: event.endDate,
    price:
      event.price != null
        ? (event.price / 100).toFixed(2)
        : "",
    registrationStart: event.registrationStart ?? "",
    registrationEnd: event.registrationEnd ?? "",
  }
}

export function EventForm({ ministries, event }: Props) {
  const router = useRouter()
  const isEdit = !!event
  const initialForm = React.useRef<EventFormValues>(
    event ? toFormValues(event) : defaultEventForm
  )
  const [form, setForm] = React.useState<EventFormValues>(initialForm.current)
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set(field: keyof EventFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(initialForm.current)
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
            <Label htmlFor="ministryId">
              Ministry <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.ministryId}
              onValueChange={(v) => set("ministryId", v)}
              required
            >
              <SelectTrigger id="ministryId">
                <SelectValue placeholder="Select ministry" />
              </SelectTrigger>
              <SelectContent>
                {ministries.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </section>

        {/* Registration */}
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

        {/* Pricing */}
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
