"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  IconCalendarPlus,
  IconCalendarRepeat,
  IconCopy,
  IconDoorEnter,
  IconDoorExit,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  createOccurrence,
  setOccurrenceCheckinOpen,
} from "@/app/(dashboard)/events/actions"

type OccurrenceRow = {
  id: string
  date: string
  isOpen: boolean
  attendeeCount: number
}

type Props = {
  eventId: string
  eventType: string
  occurrences: OccurrenceRow[]
}

function formatOccurrenceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function SessionsClient({ eventId, eventType, occurrences }: Props) {
  const router = useRouter()
  const isRecurring = eventType === "Recurring"
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [date, setDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const title = isRecurring ? "Sessions" : "Days"
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  async function handleToggleOpen(occurrenceId: string, currentlyOpen: boolean) {
    setTogglingId(occurrenceId)
    const result = await setOccurrenceCheckinOpen(occurrenceId, !currentlyOpen, eventId)
    setTogglingId(null)
    if (result.success) {
      toast.success(currentlyOpen ? "Check-in closed" : "Check-in opened")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleAddSession() {
    if (!date) return
    setSaving(true)
    const result = await createOccurrence(eventId, date)
    setSaving(false)
    if (result.success) {
      toast.success("Session added")
      setDialogOpen(false)
      setDate("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  function copyCheckinLink(occurrenceId: string) {
    const url = `${window.location.origin}/events/${eventId}/checkin/${occurrenceId}`
    navigator.clipboard.writeText(url)
    toast.success("Check-in link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {isRecurring && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <IconCalendarPlus className="mr-2 size-4" />
            Add Session
          </Button>
        )}
      </div>

      {occurrences.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconCalendarRepeat className="size-8" />
          <p className="text-sm">No {title.toLowerCase()} yet.</p>
          {isRecurring && (
            <p className="text-xs">Add a session to start tracking attendance.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">
                  {isRecurring ? "Date" : "Day"}
                </th>
                <th className="px-4 py-3 text-left font-medium">Attendance</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/event/${eventId}/sessions/${o.id}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {formatOccurrenceDate(o.date)}
                      </Link>
                      {o.isOpen && (
                        <Badge variant="default" className="text-xs">Check-in open</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{o.attendeeCount} attended</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleOpen(o.id, o.isOpen)}
                        disabled={togglingId === o.id}
                      >
                        {o.isOpen ? (
                          <>
                            <IconDoorExit className="mr-1.5 size-3.5" />
                            Close check-in
                          </>
                        ) : (
                          <>
                            <IconDoorEnter className="mr-1.5 size-3.5" />
                            Open check-in
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => copyCheckinLink(o.id)}>
                        <IconCopy className="mr-1.5 size-3.5" />
                        Copy link
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isRecurring && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Session</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddSession} disabled={!date || saving}>
                {saving ? "Adding…" : "Add Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
