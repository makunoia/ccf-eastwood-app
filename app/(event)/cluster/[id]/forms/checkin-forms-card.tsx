import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { SettingCard } from "@/components/ui/setting-card"
import {
  clusterCheckinClosedHint,
  clusterCheckinManageLabel,
  type ClusterCheckinShortcut,
} from "@/lib/clusters/checkin-shortcuts"

/**
 * Surfaces every member event's check-in form on the cluster Forms page —
 * attendance itself stays per event (each form is the event's own
 * /events/[id]/checkin), this is the one place to grab all the day's links.
 *
 * Read-only: the Public access switch above opens all of these at once, so a
 * second control per row would be a competing one. Each row still deep-links to
 * whichever screen owns it, for the one-off case.
 *
 * A row is exactly a `ClusterCheckinShortcut`, so what this card says about an
 * event is by construction what the kiosk will do with it.
 */

export type ClusterCheckinFormRow = ClusterCheckinShortcut

const TYPE_LABEL: Record<ClusterCheckinFormRow["eventType"], string> = {
  OneTime: "One-time",
  MultiDay: "Multi-day",
  Recurring: "Recurring",
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

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
            // Narrowed once, so the closed-only helpers below typecheck against
            // the status union rather than a boolean TS can't see through.
            const closed = row.status === "open" ? null : row.status
            return (
              <div
                key={row.eventId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{row.eventName}</span>
                    <Badge variant={closed ? "outline" : "default"}>
                      {closed ? "Closed" : "Open"}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TYPE_LABEL[row.eventType]}
                    {row.sessionDate && ` · ${DATE_FORMAT.format(row.sessionDate)}`}
                    {closed && ` · ${clusterCheckinClosedHint(closed)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {row.href && (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      View check-in form
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                  {/* Where the control for THIS event actually lives — Sessions
                      for a session event, Forms for a OneTime — rather than a
                      page that only points at it again. */}
                  <Link
                    href={row.manageHref}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {closed ? clusterCheckinManageLabel(closed) : "Configure"}
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
