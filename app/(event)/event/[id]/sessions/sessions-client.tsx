"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconCalendarPlus,
  IconCalendarRepeat,
  IconDoorEnter,
  IconDoorExit,
  IconExternalLink,
  IconPencil,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
import { Switch } from "@/components/ui/switch"
import {
  createOccurrence,
  createOccurrenceSeries,
  deleteOccurrence,
  deleteOccurrenceSeries,
  setOccurrenceCheckinOpen,
  updateOccurrenceGrouping,
  updateOccurrenceSeries,
} from "@/app/(dashboard)/events/actions"

export type OccurrenceRow = {
  id: string
  date: string
  isOpen: boolean
  attendeeCount: number
  isStandalone: boolean
  seriesId: string | null
}

export type OccurrenceSeriesGroup = {
  id: string
  title: string
  startDate: string
  endDate: string
  sessionCount: number
  totalAttendance: number
  averageAttendance: number
  occurrences: OccurrenceRow[]
}

export type OccurrenceSeriesOption = {
  id: string
  title: string
  startDate: string
  endDate: string
}

type Props = {
  eventId: string
  eventType: string
  occurrences: OccurrenceRow[]
  seriesGroups: OccurrenceSeriesGroup[]
  ungroupedOccurrences: OccurrenceRow[]
  seriesOptions: OccurrenceSeriesOption[]
}

type SeriesFormState = {
  title: string
  startDate: string
  endDate: string
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

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)

  const startLabel = start.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: start.getUTCFullYear() === end.getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  })
  const endLabel = end.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  return `${startLabel} – ${endLabel}`
}

function formatAverage(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function getSeriesOptionsForDate(date: string, options: OccurrenceSeriesOption[]) {
  if (!date) return options

  const occurrenceDate = new Date(`${date}T00:00:00.000Z`)
  return options.filter((series) => {
    const start = new Date(series.startDate)
    const end = new Date(series.endDate)
    return occurrenceDate >= start && occurrenceDate <= end
  })
}

function groupingBadge(occurrence: OccurrenceRow) {
  if (occurrence.isStandalone) {
    return <Badge variant="outline">Stand-alone</Badge>
  }

  if (!occurrence.seriesId) {
    return <Badge variant="outline">Ungrouped</Badge>
  }

  return null
}

function OccurrenceList({
  eventId,
  isRecurring,
  occurrences,
  showGroupingStatus,
  togglingId,
  deletingId,
  onToggleOpen,
  onManage,
  onDelete,
}: {
  eventId: string
  isRecurring: boolean
  occurrences: OccurrenceRow[]
  showGroupingStatus: boolean
  togglingId: string | null
  deletingId: string | null
  onToggleOpen: (occurrenceId: string, currentlyOpen: boolean) => void
  onManage: (occurrence: OccurrenceRow) => void
  onDelete: (occurrence: OccurrenceRow) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-3 lg:hidden">
        {occurrences.map((occurrence) => (
          <Card key={occurrence.id} className="gap-0 py-0">
            <CardContent className="space-y-4 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <Link
                    href={`/event/${eventId}/sessions/${occurrence.id}`}
                    className="block font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {formatOccurrenceDate(occurrence.date)}
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{occurrence.attendeeCount} attended</Badge>
                    {occurrence.isOpen && (
                      <Badge variant="default" className="text-xs">
                        Check-in open
                      </Badge>
                    )}
                    {showGroupingStatus ? groupingBadge(occurrence) : null}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {isRecurring ? "Session" : "Event day"}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {isRecurring && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onManage(occurrence)}
                  >
                    <IconPencil className="mr-1.5 size-3.5" />
                    Manage
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onToggleOpen(occurrence.id, occurrence.isOpen)}
                  disabled={togglingId === occurrence.id}
                >
                  {occurrence.isOpen ? (
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
                <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <a
                    href={`/events/${eventId}/checkin/${occurrence.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconExternalLink className="mr-1.5 size-3.5" />
                    Check-in page
                  </a>
                </Button>
                {isRecurring && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    onClick={() => onDelete(occurrence)}
                    disabled={deletingId === occurrence.id}
                  >
                    <IconTrash className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">
                {isRecurring ? "Date" : "Day"}
              </th>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Attendance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {occurrences.map((occurrence) => (
              <tr key={occurrence.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/event/${eventId}/sessions/${occurrence.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {formatOccurrenceDate(occurrence.date)}
                    </Link>
                    {occurrence.isOpen && (
                      <Badge variant="default" className="text-xs">
                        Check-in open
                      </Badge>
                    )}
                    {showGroupingStatus ? groupingBadge(occurrence) : null}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge variant="secondary">{occurrence.attendeeCount} attended</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-stretch gap-2 xl:flex-row xl:items-center xl:justify-end">
                    {isRecurring && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start xl:justify-center"
                        onClick={() => onManage(occurrence)}
                      >
                        <IconPencil className="mr-1.5 size-3.5" />
                        Manage
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start xl:justify-center"
                      onClick={() => onToggleOpen(occurrence.id, occurrence.isOpen)}
                      disabled={togglingId === occurrence.id}
                    >
                      {occurrence.isOpen ? (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start xl:justify-center"
                      asChild
                    >
                      <a
                        href={`/events/${eventId}/checkin/${occurrence.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconExternalLink className="mr-1.5 size-3.5" />
                        Check-in page
                      </a>
                    </Button>
                    {isRecurring && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-destructive hover:text-destructive xl:justify-center"
                        onClick={() => onDelete(occurrence)}
                        disabled={deletingId === occurrence.id}
                      >
                        <IconTrash className="mr-1.5 size-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function SessionsClient({
  eventId,
  eventType,
  occurrences,
  seriesGroups,
  ungroupedOccurrences,
  seriesOptions,
}: Props) {
  const router = useRouter()
  const isRecurring = eventType === "Recurring"
  const title = isRecurring ? "Sessions" : "Days"
  const hasRecurringContent = seriesGroups.length > 0 || ungroupedOccurrences.length > 0

  const [sessionDialogOpen, setSessionDialogOpen] = React.useState(false)
  const [sessionDate, setSessionDate] = React.useState("")
  const [sessionStandalone, setSessionStandalone] = React.useState(false)
  const [sessionSeriesMode, setSessionSeriesMode] = React.useState("auto")
  const [savingSession, setSavingSession] = React.useState(false)

  const [seriesDialogOpen, setSeriesDialogOpen] = React.useState(false)
  const [seriesForm, setSeriesForm] = React.useState<SeriesFormState>({
    title: "",
    startDate: "",
    endDate: "",
  })
  const [editingSeries, setEditingSeries] = React.useState<OccurrenceSeriesGroup | null>(null)
  const [savingSeries, setSavingSeries] = React.useState(false)

  const [occurrenceToDelete, setOccurrenceToDelete] = React.useState<OccurrenceRow | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [seriesToDelete, setSeriesToDelete] = React.useState<OccurrenceSeriesGroup | null>(null)
  const [deletingSeriesId, setDeletingSeriesId] = React.useState<string | null>(null)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const [occurrenceToManage, setOccurrenceToManage] = React.useState<OccurrenceRow | null>(null)
  const [manageStandalone, setManageStandalone] = React.useState(false)
  const [manageSeriesMode, setManageSeriesMode] = React.useState("auto")
  const [savingManage, setSavingManage] = React.useState(false)

  const availableSeriesForNewSession = React.useMemo(
    () => getSeriesOptionsForDate(sessionDate, seriesOptions),
    [sessionDate, seriesOptions],
  )

  const availableSeriesForManagedSession = React.useMemo(() => {
    if (!occurrenceToManage) return []
    return getSeriesOptionsForDate(
      occurrenceToManage.date.split("T")[0],
      seriesOptions,
    )
  }, [occurrenceToManage, seriesOptions])

  function resetSessionForm() {
    setSessionDate("")
    setSessionStandalone(false)
    setSessionSeriesMode("auto")
  }

  function openCreateSeriesDialog() {
    setEditingSeries(null)
    setSeriesForm({
      title: "",
      startDate: "",
      endDate: "",
    })
    setSeriesDialogOpen(true)
  }

  function openEditSeriesDialog(series: OccurrenceSeriesGroup) {
    setEditingSeries(series)
    setSeriesForm({
      title: series.title,
      startDate: series.startDate.split("T")[0],
      endDate: series.endDate.split("T")[0],
    })
    setSeriesDialogOpen(true)
  }

  function openManageDialog(occurrence: OccurrenceRow) {
    setOccurrenceToManage(occurrence)
    setManageStandalone(occurrence.isStandalone)
    setManageSeriesMode(occurrence.seriesId ?? "auto")
  }

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
    if (!sessionDate) return

    setSavingSession(true)
    const result = await createOccurrence(eventId, {
      date: sessionDate,
      isStandalone: sessionStandalone,
      seriesId: !sessionStandalone && sessionSeriesMode !== "auto" ? sessionSeriesMode : null,
    })
    setSavingSession(false)

    if (result.success) {
      toast.success("Session added")
      setSessionDialogOpen(false)
      resetSessionForm()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleSaveSeries() {
    setSavingSeries(true)
    const result = editingSeries
      ? await updateOccurrenceSeries(editingSeries.id, eventId, seriesForm)
      : await createOccurrenceSeries(eventId, seriesForm)
    setSavingSeries(false)

    if (result.success) {
      toast.success(editingSeries ? "Series updated" : "Series added")
      setSeriesDialogOpen(false)
      setEditingSeries(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleManageOccurrence() {
    if (!occurrenceToManage) return

    setSavingManage(true)
    const result = await updateOccurrenceGrouping(occurrenceToManage.id, eventId, {
      isStandalone: manageStandalone,
      seriesId: !manageStandalone && manageSeriesMode !== "auto" ? manageSeriesMode : null,
    })
    setSavingManage(false)

    if (result.success) {
      toast.success("Session updated")
      setOccurrenceToManage(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleDeleteSession() {
    if (!occurrenceToDelete) return

    setDeletingId(occurrenceToDelete.id)
    const result = await deleteOccurrence(occurrenceToDelete.id, eventId)
    setDeletingId(null)
    if (result.success) {
      toast.success("Session deleted")
      setOccurrenceToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleDeleteSeries() {
    if (!seriesToDelete) return

    setDeletingSeriesId(seriesToDelete.id)
    const result = await deleteOccurrenceSeries(seriesToDelete.id, eventId)
    setDeletingSeriesId(null)
    if (result.success) {
      toast.success("Series deleted")
      setSeriesToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {isRecurring ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={openCreateSeriesDialog}>
              <IconStack2 className="mr-2 size-4" />
              Add Series
            </Button>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setSessionDialogOpen(true)}>
              <IconCalendarPlus className="mr-2 size-4" />
              Add Session
            </Button>
          </div>
        ) : null}
      </div>

      {!isRecurring && occurrences.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconCalendarRepeat className="size-8" />
          <p className="text-sm">No {title.toLowerCase()} yet.</p>
        </div>
      ) : null}

      {isRecurring && !hasRecurringContent ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <IconCalendarRepeat className="size-8" />
          <p className="text-sm">No sessions yet.</p>
          <p className="text-xs">Add a series or session to start tracking attendance.</p>
        </div>
      ) : null}

      {!isRecurring && occurrences.length > 0 ? (
        <OccurrenceList
          eventId={eventId}
          isRecurring={false}
          occurrences={occurrences}
          showGroupingStatus={false}
          togglingId={togglingId}
          deletingId={deletingId}
          onToggleOpen={handleToggleOpen}
          onManage={() => undefined}
          onDelete={setOccurrenceToDelete}
        />
      ) : null}

      {isRecurring ? (
        <div className="space-y-4">
          {seriesGroups.map((series) => (
            <Card key={series.id}>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{series.title}</CardTitle>
                    <CardDescription>{formatDateRange(series.startDate, series.endDate)}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{series.sessionCount} sessions</Badge>
                    <Badge variant="secondary">{series.totalAttendance} attendance</Badge>
                    <Badge variant="secondary">
                      Avg {formatAverage(series.averageAttendance)}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" size="sm" onClick={() => openEditSeriesDialog(series)}>
                    <IconPencil className="mr-1.5 size-3.5" />
                    Edit series
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setSeriesToDelete(series)}
                  >
                    <IconTrash className="mr-1.5 size-3.5" />
                    Delete series
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {series.occurrences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions assigned to this series yet.</p>
                ) : (
                  <OccurrenceList
                    eventId={eventId}
                    isRecurring
                    occurrences={series.occurrences}
                    showGroupingStatus={false}
                    togglingId={togglingId}
                    deletingId={deletingId}
                    onToggleOpen={handleToggleOpen}
                    onManage={openManageDialog}
                    onDelete={setOccurrenceToDelete}
                  />
                )}
              </CardContent>
            </Card>
          ))}

          {ungroupedOccurrences.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Ungrouped Sessions</CardTitle>
                <CardDescription>
                  Includes special stand-alone sessions and recurring dates not yet assigned to a series.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OccurrenceList
                  eventId={eventId}
                  isRecurring
                  occurrences={ungroupedOccurrences}
                  showGroupingStatus
                  togglingId={togglingId}
                  deletingId={deletingId}
                  onToggleOpen={handleToggleOpen}
                  onManage={openManageDialog}
                  onDelete={setOccurrenceToDelete}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={sessionDialogOpen}
        onOpenChange={(open) => {
          setSessionDialogOpen(open)
          if (!open && !savingSession) resetSessionForm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Session</DialogTitle>
            <DialogDescription>
              Add a recurring session and optionally keep it stand-alone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <div className="space-y-1">
                <Label htmlFor="session-standalone">Stand-alone session</Label>
                <p className="text-xs text-muted-foreground">
                  Use this for one-off specials like anniversaries or collaborations.
                </p>
              </div>
              <Switch
                id="session-standalone"
                checked={sessionStandalone}
                onCheckedChange={setSessionStandalone}
              />
            </div>
            {!sessionStandalone ? (
              <div className="space-y-2">
                <Label>Series</Label>
                <Select value={sessionSeriesMode} onValueChange={setSessionSeriesMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto assign by date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto assign by date</SelectItem>
                    {availableSeriesForNewSession.map((series) => (
                      <SelectItem key={series.id} value={series.id}>
                        {series.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {availableSeriesForNewSession.length > 0
                    ? "Matching series are available for this date."
                    : "If no matching series exists, this session will remain ungrouped."}
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionDialogOpen(false)} disabled={savingSession}>
              Cancel
            </Button>
            <Button onClick={handleAddSession} disabled={!sessionDate || savingSession}>
              {savingSession ? "Adding…" : "Add Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seriesDialogOpen}
        onOpenChange={(open) => {
          setSeriesDialogOpen(open)
          if (!open && !savingSeries) setEditingSeries(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeries ? "Edit series" : "Add series"}</DialogTitle>
            <DialogDescription>
              Group recurring sessions under a titled date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="series-title">Title</Label>
              <Input
                id="series-title"
                value={seriesForm.title}
                onChange={(event) =>
                  setSeriesForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="e.g. February to March Run"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="series-start">Start date</Label>
                <Input
                  id="series-start"
                  type="date"
                  value={seriesForm.startDate}
                  onChange={(event) =>
                    setSeriesForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="series-end">End date</Label>
                <Input
                  id="series-end"
                  type="date"
                  value={seriesForm.endDate}
                  onChange={(event) =>
                    setSeriesForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriesDialogOpen(false)} disabled={savingSeries}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSeries}
              disabled={!seriesForm.title || !seriesForm.startDate || !seriesForm.endDate || savingSeries}
            >
              {savingSeries ? "Saving…" : editingSeries ? "Save changes" : "Add series"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={occurrenceToManage !== null}
        onOpenChange={(open) => {
          if (!open && !savingManage) {
            setOccurrenceToManage(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Session</DialogTitle>
            <DialogDescription>
              {occurrenceToManage ? formatOccurrenceDate(occurrenceToManage.date) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <div className="space-y-1">
                <Label htmlFor="manage-standalone">Stand-alone session</Label>
                <p className="text-xs text-muted-foreground">
                  Keep this session outside any recurring series.
                </p>
              </div>
              <Switch
                id="manage-standalone"
                checked={manageStandalone}
                onCheckedChange={setManageStandalone}
              />
            </div>
            {!manageStandalone ? (
              <div className="space-y-2">
                <Label>Series</Label>
                <Select value={manageSeriesMode} onValueChange={setManageSeriesMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto assign by date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto assign by date</SelectItem>
                    {availableSeriesForManagedSession.map((series) => (
                      <SelectItem key={series.id} value={series.id}>
                        {series.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOccurrenceToManage(null)}
              disabled={savingManage}
            >
              Cancel
            </Button>
            <Button onClick={handleManageOccurrence} disabled={!occurrenceToManage || savingManage}>
              {savingManage ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={occurrenceToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) setOccurrenceToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session</DialogTitle>
            <DialogDescription>
              {occurrenceToDelete ? (
                <>
                  Delete{" "}
                  <span className="font-medium">
                    {formatOccurrenceDate(occurrenceToDelete.date)}
                  </span>
                  ? This will also remove {occurrenceToDelete.attendeeCount} attendance
                  {occurrenceToDelete.attendeeCount === 1 ? " record" : " records"} and any
                  sub-facilitator assignments for this session.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOccurrenceToDelete(null)}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={occurrenceToDelete === null || deletingId !== null}
            >
              {deletingId !== null ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seriesToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingSeriesId) setSeriesToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete series</DialogTitle>
            <DialogDescription>
              {seriesToDelete ? (
                <>
                  Delete <span className="font-medium">{seriesToDelete.title}</span>? This keeps all{" "}
                  {seriesToDelete.sessionCount} sessions and attendance records, but removes their
                  grouping under this series.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSeriesToDelete(null)}
              disabled={deletingSeriesId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSeries}
              disabled={!seriesToDelete || deletingSeriesId !== null}
            >
              {deletingSeriesId !== null ? "Deleting…" : "Delete series"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
