import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { SettingCard } from "@/components/ui/setting-card"

/**
 * Surfaces every member event's check-in form on the cluster Forms page —
 * attendance itself stays per event (each form is the event's own
 * /events/[id]/checkin), this is the one place to grab all the day's links.
 */

export type ClusterCheckinFormRow = {
  eventId: string
  eventName: string
  type: "OneTime" | "MultiDay" | "Recurring"
  /** Sessions events only: whether a session is currently accepting check-ins. */
  hasOpenSession: boolean
  /** OneTime only: the Public access switch. Always true for session events. */
  isFormOpen: boolean
}

const TYPE_LABEL: Record<ClusterCheckinFormRow["type"], string> = {
  OneTime: "One-time",
  MultiDay: "Multi-day",
  Recurring: "Recurring",
}

export function CheckinFormsCard({ rows }: { rows: ClusterCheckinFormRow[] }) {
  return (
    <SettingCard
      className="max-w-2xl"
      title="Check-in forms"
      description="Each event keeps its own check-in form — this lists all of the day's links in one place. Attendance lands on the event the person checks in to."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No events in this cluster yet — add them in Settings.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const checkinPath = `/events/${row.eventId}/checkin`
            return (
              <div
                key={row.eventId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{row.eventName}</span>
                    {/* Closed outranks the session badge — showing "Session open"
                        next to a link nobody can use would read as a promise. */}
                    {!row.isFormOpen ? (
                      <Badge variant="outline">Closed</Badge>
                    ) : (
                      row.type !== "OneTime" && (
                        <Badge variant={row.hasOpenSession ? "default" : "outline"}>
                          {row.hasOpenSession ? "Session open" : "No open session"}
                        </Badge>
                      )
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TYPE_LABEL[row.type]}
                    {!row.isFormOpen
                      ? " · check-in is closed for this event"
                      : row.type !== "OneTime" &&
                        " · opens per session from the event's Sessions page"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <a
                    href={checkinPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    View check-in form
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <Link
                    href={`/event/${row.eventId}/forms/EventCheckIn`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Configure
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SettingCard>
  )
}
