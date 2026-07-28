"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  addEventToCluster,
  deleteEventCluster,
  removeEventFromCluster,
  updateEventCluster,
} from "@/app/(dashboard)/events/cluster-actions"

type ClusterData = {
  id: string
  name: string
  description: string | null
  date: string | null
}

type EventRow = { id: string; name: string; type: string; startDate: string }

const EVENT_TYPE_LABEL: Record<string, string> = {
  OneTime: "One-time",
  MultiDay: "Multi-day",
  Recurring: "Recurring",
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ""
}

export function ClusterSettingsClient({
  cluster,
  events,
  candidates,
}: {
  cluster: ClusterData
  events: EventRow[]
  candidates: EventRow[]
}) {
  const router = useRouter()

  // ── Details ──
  const [name, setName] = React.useState(cluster.name)
  const [description, setDescription] = React.useState(cluster.description ?? "")
  const [date, setDate] = React.useState(toDateInput(cluster.date))
  const [savingDetails, setSavingDetails] = React.useState(false)

  // ── Events ──
  const [addEventId, setAddEventId] = React.useState("")
  const [addingEvent, setAddingEvent] = React.useState(false)
  const [removingEventId, setRemovingEventId] = React.useState<string | null>(null)

  // ── Danger zone ──
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function saveDetails() {
    if (!name.trim()) {
      toast.error("Name is required.")
      return
    }
    setSavingDetails(true)
    const result = await updateEventCluster(cluster.id, {
      name,
      description: description || null,
      date: date ? new Date(date) : null,
    })
    setSavingDetails(false)
    if (result.success) {
      toast.success("Details saved")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleAddEvent() {
    if (!addEventId) return
    setAddingEvent(true)
    const result = await addEventToCluster(cluster.id, addEventId)
    setAddingEvent(false)
    if (result.success) {
      toast.success("Event added to cluster")
      setAddEventId("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleRemoveEvent(eventId: string) {
    setRemovingEventId(eventId)
    const result = await removeEventFromCluster(cluster.id, eventId)
    setRemovingEventId(null)
    if (result.success) {
      toast.success("Event removed — its registrants are untouched")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEventCluster(cluster.id)
    setDeleting(false)
    setConfirmDelete(false)
    if (result.success) {
      toast.success("Cluster deleted")
      router.push("/events/clusters")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      {/* ── Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Name, date, and description of this event day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cluster-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="cluster-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cluster-date">Date</Label>
            <Input
              id="cluster-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cluster-description">Description</Label>
            <Textarea
              id="cluster-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={saveDetails} disabled={savingDetails}>
            {savingDetails ? "Saving…" : "Save details"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Events ── */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            The events this day is made of. Only free events can join, and an event
            can belong to one cluster at a time. Removing an event never touches its
            registrants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet — add the first one below.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {EVENT_TYPE_LABEL[e.type] ?? e.type} ·{" "}
                      {new Date(e.startDate).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${e.name}`}
                    disabled={removingEventId === e.id}
                    onClick={() => handleRemoveEvent(e.id)}
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Select value={addEventId} onValueChange={setAddEventId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add an event…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No available events — free events not already in a cluster appear here.
                  </div>
                ) : (
                  candidates.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({EVENT_TYPE_LABEL[e.type] ?? e.type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleAddEvent} disabled={!addEventId || addingEvent}>
              <IconPlus className="size-4" />
              {addingEvent ? "Adding…" : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Danger zone ── */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Deleting the cluster removes the grouping and the shared form. Events and
            their registrants are never deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <IconTrash className="size-4" />
            Delete cluster
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cluster.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The cluster, its shared form configuration, and its public link stop
              working immediately. The events themselves and every registrant are
              kept. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete cluster"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
