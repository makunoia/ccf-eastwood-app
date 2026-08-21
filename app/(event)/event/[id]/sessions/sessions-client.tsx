"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconCalendarPlus,
  IconCalendarRepeat,
  IconDotsVertical,
  IconDownload,
  IconExternalLink,
  IconFileDownload,
  IconPencil,
  IconStack2,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  formatAttendanceCount,
  formatAverageAttendance,
  formatOccurrenceDate,
  formatSessionCount,
} from "@/lib/format/occurrence"
import { plural } from "@/lib/format/plural"
import { isCheckinLive } from "@/lib/events/checkin-link"
import { PageActions, PageHeader, type PageAction } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  exportSessionAttendanceCSV,
  exportSessionsSummaryCSV,
} from "@/lib/export-entities"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { exportFilename } from "@/lib/exports/filename"
import { buildTurnout, formatTurnoutRate, formatTurnoutRatio } from "@/lib/events/turnout"
import {
  SESSION_ATTENDANCE_GROUPS,
  type SessionAttendanceExportRow,
  type SessionAttendanceGroup,
} from "@/lib/exports/session-attendance"
import { getSessionsAttendanceExport } from "./export-actions"

export type OccurrenceRow = {
  id: string
  date: string
  /** Every check-in, volunteers included — what "N people checked in" reports. */
  attendeeCount: number
  isOpen: boolean
  /** Check-ins by registered people only — the turnout numerator. */
  participantCount: number
  isStandalone: boolean
  seriesId: string | null
}

export type OccurrenceSeriesGroup = {
  id: string
  title: string
  startDate: string
  endDate: string
  sessionCount: number
  /** Sessions already held — what the average divides by. */
  heldSessionCount: number
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
  eventName: string
  eventType: string
  occurrences: OccurrenceRow[]
  seriesGroups: OccurrenceSeriesGroup[]
  ungroupedOccurrences: OccurrenceRow[]
  seriesOptions: OccurrenceSeriesOption[]
  canExport: boolean
  /**
   * The event's registered roster — the denominator every row's turnout divides
   * by. One figure for the whole list: registration is per event series, not per
   * session, so every row shares it.
   */
  totalRegistrants: number
  /**
   * Today as a UTC day key, resolved on the server. The kiosk's date gate is on
   * UTC days (occurrence dates are stored at UTC midnight), and reading the
   * clock in the browser instead would let the two sides of hydration disagree
   * about which row is today.
   */
  today: string
}

type SeriesFormState = {
  title: string
  startDate: string
  endDate: string
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

  return null
}

/**
 * One session.
 *
 * Two zones with a rule between them: what this session *is* on top — the date,
 * the turnout, the trailing menu — and what you *do* with it below. That split
 * is why the card stays calm no matter how wide the screen: each zone holds two
 * things at opposite edges, and nothing has to be crowded into a cluster.
 *
 * It is the same card at every width. The desktop table it replaced put the date
 * at the far left and its controls eight hundred pixels away at the far right,
 * which is its own kind of crowding — the eye crossing the whole page to connect
 * a session to the switch that runs it. Binding them into one object of readable
 * width fixes that, so there are no breakpoint variants here at all.
 *
 * The switch names its own state, so the state needs no second badge. Manage and
 * Delete are structural and rare, so they sit in the `⋯` with their names on.
 * "Check-in page" appears only when the kiosk would admit someone
 * (`isCheckinLive`) — on a past session that link led to "Check-in not
 * available", and an action that does nothing is the most crowding thing on a
 * card this size.
 */
function SessionCard({
  eventId,
  isRecurring,
  occurrence,
  showGroupingStatus,
  today,
  totalRegistrants,
  togglingId,
  deletingId,
  onToggleOpen,
  onManage,
  onDelete,
}: {
  eventId: string
  isRecurring: boolean
  occurrence: OccurrenceRow
  showGroupingStatus: boolean
  today: string
  totalRegistrants: number
  togglingId: string | null
  deletingId: string | null
  onToggleOpen: (occurrenceId: string, currentlyOpen: boolean) => void
  onManage: (occurrence: OccurrenceRow) => void
  onDelete: (occurrence: OccurrenceRow) => void
}) {
  const toggling = togglingId === occurrence.id
  const deleting = deletingId === occurrence.id
  const switchId = `checkin-${occurrence.id}`
  const kioskReachable = isCheckinLive({
    isOpen: occurrence.isOpen,
    date: occurrence.date,
    today,
  })
  // An event nobody registered for has no ratio to divide, and "— / 0 of 0
  // registered" is two lines of nothing. Nor is a ratio shown before anyone has
  // checked in: that is every future-dated row on the list, and "0%" beside "No
  // one checked in yet" reads as a session that failed rather than one that has
  // not happened. The block is simply absent in both cases.
  const turnout =
    totalRegistrants > 0 && occurrence.attendeeCount > 0
      ? buildTurnout(totalRegistrants, occurrence.participantCount)
      : null

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link
              href={`/event/${eventId}/sessions/${occurrence.id}`}
              className="block font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              {formatOccurrenceDate(occurrence.date)}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconUsers className="size-3.5 shrink-0" />
                {formatAttendanceCount(occurrence.attendeeCount)}
              </span>
              {showGroupingStatus ? groupingBadge(occurrence) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            {turnout ? (
              // The percentage never travels without its denominator: this one
              // divides by the whole series roster, while the check-in count to
              // its left includes volunteers. Two populations, so each says so.
              <div className="text-right leading-tight">
                <p className="text-sm font-medium tabular-nums">
                  {formatTurnoutRate(turnout.rate)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatTurnoutRatio(turnout)}
                </p>
              </div>
            ) : null}
            {isRecurring ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0">
                  <IconDotsVertical className="size-4" />
                  <span className="sr-only">
                    More actions for {formatOccurrenceDate(occurrence.date)}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onManage(occurrence)}>
                  <IconPencil className="size-4" />
                  Manage session
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={deleting}
                  onSelect={() => onDelete(occurrence)}
                >
                  <IconTrash className="size-4" />
                  Delete session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={occurrence.isOpen}
              disabled={toggling}
              onCheckedChange={() => onToggleOpen(occurrence.id, occurrence.isOpen)}
            />
            <Label htmlFor={switchId} className="cursor-pointer text-sm font-normal">
              {occurrence.isOpen ? "Check-in open" : "Check-in closed"}
            </Label>
          </div>
          {kioskReachable ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/events/${eventId}/checkin/${occurrence.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconExternalLink className="size-4" />
                Check-in page
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/** A column of session cards. One composition, every width, every context. */
function OccurrenceList({
  eventId,
  isRecurring,
  occurrences,
  showGroupingStatus,
  today,
  totalRegistrants,
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
  today: string
  totalRegistrants: number
  togglingId: string | null
  deletingId: string | null
  onToggleOpen: (occurrenceId: string, currentlyOpen: boolean) => void
  onManage: (occurrence: OccurrenceRow) => void
  onDelete: (occurrence: OccurrenceRow) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {occurrences.map((occurrence) => (
        <SessionCard
          key={occurrence.id}
          eventId={eventId}
          isRecurring={isRecurring}
          occurrence={occurrence}
          showGroupingStatus={showGroupingStatus}
          today={today}
          totalRegistrants={totalRegistrants}
          togglingId={togglingId}
          deletingId={deletingId}
          onToggleOpen={onToggleOpen}
          onManage={onManage}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function openCountOf(occurrences: OccurrenceRow[]): number {
  return occurrences.filter((occurrence) => occurrence.isOpen).length
}

/** `4 sessions` / `4 sessions · 1 open` — the count, and whether anything is live. */
function listSummary(occurrences: OccurrenceRow[], noun: string): string {
  const openCount = openCountOf(occurrences)
  const count = plural(occurrences.length, noun)
  return openCount > 0 ? `${count} · ${openCount} open` : count
}

export function SessionsClient({
  eventId,
  eventName,
  eventType,
  occurrences,
  seriesGroups,
  ungroupedOccurrences,
  seriesOptions,
  canExport,
  totalRegistrants,
  today,
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
    const result = await setOccurrenceCheckinOpen(occurrenceId, !currentlyOpen)
    setTogglingId(null)
    if (result.success) {
      // Says the second effect out loud: this switch also aims the walk-in door
      // (see `setOccurrenceCheckinOpen`), and staff shouldn't have to learn that
      // from a door that stopped working. Silent when the door didn't move —
      // closing a session it was never aimed at changes nothing.
      toast.success(currentlyOpen ? "Check-in closed" : "Check-in opened", {
        description: !result.data.walkInChanged
          ? undefined
          : currentlyOpen
            ? "Walk-in is off until you open a session."
            : "Walk-in now registers into this session.",
      })
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

  const allOccurrences = React.useMemo(
    () =>
      isRecurring
        ? [
            ...seriesGroups.flatMap((series) =>
              series.occurrences.map((occurrence) => ({
                ...occurrence,
                seriesTitle: series.title,
              })),
            ),
            ...ungroupedOccurrences.map((occurrence) => ({
              ...occurrence,
              seriesTitle: null,
            })),
          ]
        : occurrences.map((occurrence) => ({ ...occurrence, seriesTitle: null })),
    [isRecurring, seriesGroups, ungroupedOccurrences, occurrences],
  )

  function handleExportSessions() {
    exportSessionsSummaryCSV(
      `${isRecurring ? "sessions" : "days"}-${eventId}`,
      allOccurrences.map((occurrence) => ({
        date: occurrence.date,
        seriesTitle: occurrence.seriesTitle,
        isStandalone: occurrence.isStandalone,
        attendeeCount: occurrence.attendeeCount,
      })),
      isRecurring,
    )
  }

  const { open: openAttendanceExport, dialog: attendanceExportDialog } =
    useExportColumnsDialog<SessionAttendanceExportRow, SessionAttendanceGroup>({
      title: "Export attendance",
      description: `Everyone who checked in across all ${title.toLowerCase()} — registrants and volunteers alike, one row per check-in.`,
      groups: SESSION_ATTENDANCE_GROUPS,
      unit: ["check-in", "check-ins"],
      emptyMessage: "No attendance to export yet.",
      loadingMessage: "Gathering check-ins…",
      load: () => getSessionsAttendanceExport(eventId),
      download: (rows, selected) =>
        exportSessionAttendanceCSV(
          exportFilename(eventName, "session-attendance"),
          rows,
          selected,
        ),
    })

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

  const exportActions: PageAction[] = canExport
    ? [
        {
          label: `Export ${title.toLowerCase()}`,
          icon: <IconFileDownload className="size-4" />,
          onSelect: handleExportSessions,
          disabled: allOccurrences.length === 0,
          overflow: true,
        },
        {
          label: "Export attendance",
          icon: <IconDownload className="size-4" />,
          onSelect: openAttendanceExport,
          disabled: allOccurrences.length === 0,
          overflow: true,
        },
      ]
    : []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title={title}
        actions={
          isRecurring || exportActions.length > 0 ? (
            <PageActions
              primary={
                isRecurring
                  ? {
                      label: "Add Session",
                      icon: <IconCalendarPlus className="size-4" />,
                      onSelect: () => setSessionDialogOpen(true),
                    }
                  : undefined
              }
              actions={[
                ...(isRecurring
                  ? [
                      {
                        label: "Add Series",
                        icon: <IconStack2 className="size-4" />,
                        onSelect: openCreateSeriesDialog,
                      } satisfies PageAction,
                    ]
                  : []),
                ...exportActions,
              ]}
            />
          ) : undefined
        }
      />

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
        <div className="w-full max-w-3xl space-y-2">
          <p className="text-sm text-muted-foreground">{listSummary(occurrences, "day")}</p>
          <OccurrenceList
            eventId={eventId}
            isRecurring={false}
            occurrences={occurrences}
            showGroupingStatus={false}
            today={today}
            totalRegistrants={totalRegistrants}
            togglingId={togglingId}
            deletingId={deletingId}
            onToggleOpen={handleToggleOpen}
            onManage={() => undefined}
            onDelete={setOccurrenceToDelete}
          />
        </div>
      ) : null}

      {isRecurring ? (
        /* Sections, not cards. Each session is a card now, and a card holding
           cards is a border inside a border — the nesting DESIGN.md rules out.
           A heading with generous space above it groups just as well and takes a
           whole layer of chrome off the page. */
        <div className="w-full max-w-3xl space-y-10">
          {seriesGroups.map((series) => (
            <section key={series.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="font-semibold">{series.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDateRange(series.startDate, series.endDate)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0">
                      <IconDotsVertical className="size-4" />
                      <span className="sr-only">More actions for {series.title}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openEditSeriesDialog(series)}>
                      <IconPencil className="size-4" />
                      Edit series
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setSeriesToDelete(series)}
                    >
                      <IconTrash className="size-4" />
                      Delete series
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{formatSessionCount(series.sessionCount)}</Badge>
                {/* The average divides by held sessions only, so a series with
                    sessions still to come has to say which count it used. */}
                {series.heldSessionCount < series.sessionCount && (
                  <Badge variant="secondary">{series.heldSessionCount} held</Badge>
                )}
                <Badge variant="secondary">{series.totalAttendance} total attendance</Badge>
                <Badge variant="secondary">
                  {formatAverageAttendance(series.averageAttendance)}
                </Badge>
                {openCountOf(series.occurrences) > 0 && (
                  <Badge>{openCountOf(series.occurrences)} open</Badge>
                )}
              </div>
              {series.occurrences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sessions assigned to this series yet.
                </p>
              ) : (
                <OccurrenceList
                  eventId={eventId}
                  isRecurring
                  occurrences={series.occurrences}
                  showGroupingStatus={false}
                  today={today}
                  totalRegistrants={totalRegistrants}
                  togglingId={togglingId}
                  deletingId={deletingId}
                  onToggleOpen={handleToggleOpen}
                  onManage={openManageDialog}
                  onDelete={setOccurrenceToDelete}
                />
              )}
            </section>
          ))}

          {ungroupedOccurrences.length > 0 ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="font-semibold">Ungrouped Sessions</h2>
                <p className="text-sm text-muted-foreground">
                  Includes special stand-alone sessions and recurring dates not yet
                  assigned to a series.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {listSummary(ungroupedOccurrences, "session")}
              </p>
              <OccurrenceList
                eventId={eventId}
                isRecurring
                occurrences={ungroupedOccurrences}
                showGroupingStatus
                today={today}
                totalRegistrants={totalRegistrants}
                togglingId={togglingId}
                deletingId={deletingId}
                onToggleOpen={handleToggleOpen}
                onManage={openManageDialog}
                onDelete={setOccurrenceToDelete}
              />
            </section>
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

      {attendanceExportDialog}
    </div>
  )
}
