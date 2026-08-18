import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconCheck, IconCalendarEvent, IconForms, IconUserCheck, IconUsers } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getClusterOverview } from "@/lib/clusters/aggregate"
import { personTypeFor, standingFor } from "@/lib/clusters/roster"
import { DetailPageHeader } from "@/components/detail-page-header"
import { StatCard } from "@/components/session-stat-card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = {
  title: "Dashboard",
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  OneTime: "One-time",
  MultiDay: "Multi-day",
  Recurring: "Recurring",
}

export default async function ClusterDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params

  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true, name: true, date: true, description: true },
  })
  if (!cluster) notFound()

  const overview = await getClusterOverview(session, id)
  // Only session events have a roster wider than the day, so the caveat about
  // day-scoping is only worth showing when one is in the cluster.
  const hasSessionEvent = overview.events.some((e) => e.type !== "OneTime")

  const dateLabel = cluster.date
    ? cluster.date.toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null

  return (
    <>
      <DetailPageHeader
        title="Dashboard"
        subtitle={
          <p className="text-sm text-muted-foreground">
            {[dateLabel, cluster.description].filter(Boolean).join(" · ") ||
              "The whole day at a glance"}
          </p>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* ── Day totals (scoped to the events this user can see) ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Events"
            value={overview.events.length}
            icon={<IconCalendarEvent className="size-4" />}
          />
          <StatCard
            label="People on the day"
            value={overview.totals.uniquePeople}
            icon={<IconUsers className="size-4" />}
          />
          <StatCard
            label="Checked in"
            value={overview.totals.checkedInPeople}
            icon={<IconUserCheck className="size-4" />}
          />
          <StatCard
            label="Via day link"
            value={
              <>
                {overview.totals.viaSharedLinkPeople}
                <span className="text-base font-normal text-muted-foreground">
                  {" / "}
                  {overview.totals.uniquePeople}
                </span>
              </>
            }
            icon={<IconForms className="size-4" />}
          />
        </div>

        <p className="-mt-3 text-xs text-muted-foreground">
          People counted once each, however many of the day&apos;s events they
          registered for — the serving team included, since somebody volunteering
          is one of the day&apos;s people rather than a separate list. <span className="font-medium">Via day link</span> is how
          many of them signed up through this day&apos;s shared registration link
          rather than an individual event&apos;s own link.
          {hasSessionEvent && (
            <>
              {" "}
              Recurring and multi-day events count the people who checked in on
              this date or signed up through the day link — not their whole
              standing roster.
            </>
          )}
        </p>

        {/* ── Per-event tiles ── */}
        {overview.eventStats.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No events in this cluster yet — add them in{" "}
            <Link href={`/cluster/${id}/settings`} className="underline underline-offset-2">
              Settings
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.eventStats.map((stat) => (
              <div key={stat.eventId} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/event/${stat.eventId}/dashboard`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {stat.name}
                  </Link>
                  <Badge variant="outline">{EVENT_TYPE_LABEL[stat.type] ?? stat.type}</Badge>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{stat.registered}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.type === "OneTime" ? "Registered" : "On this date"}
                    </p>
                  </div>
                  {/* Kept beside registrations rather than folded into them: the
                      two are planned for separately, and the series figure below
                      is comparable only with registrations. */}
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{stat.volunteers}</p>
                    <p className="text-xs text-muted-foreground">Serving</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{stat.checkedIn}</p>
                    <p className="text-xs text-muted-foreground">Checked in</p>
                  </div>
                </div>
                {stat.type !== "OneTime" && (
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>{stat.seriesRegistered} registered for the series overall</p>
                    <p>
                      {stat.linkedOccurrenceDate ? (
                        <>
                          Scoped to the{" "}
                          {stat.linkedOccurrenceDate.toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}{" "}
                          session
                        </>
                      ) : (
                        <Link
                          href={`/cluster/${id}/settings`}
                          className="underline underline-offset-2"
                        >
                          No session picked — counting by date
                        </Link>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Combined roster matrix (person × events) ── */}
        {overview.roster.rows.length > 0 && (
          <div className="space-y-2">
            <h3 className="type-label text-muted-foreground">Day roster</h3>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    {overview.events.map((e) => (
                      <TableHead key={e.id} className="text-center whitespace-nowrap">
                        {e.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.roster.rows.map((person) => (
                    <TableRow key={person.key}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">
                          {person.firstName} {person.lastName}
                        </span>
                        {(person.isVolunteer || person.isMember) && (
                          <Badge
                            variant={person.isVolunteer ? "default" : "secondary"}
                            className="ml-2"
                          >
                            {personTypeFor(person)}
                          </Badge>
                        )}
                      </TableCell>
                      {overview.events.map((e) => {
                        const cell = person.perEvent[e.id]
                        const standing = cell ? standingFor(cell) : null
                        return (
                          <TableCell key={e.id} className="text-center">
                            {standing === "CheckedIn" ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <IconCheck className="size-4" />
                                <span className="sr-only">Checked in</span>
                              </span>
                            ) : standing === "OnDay" ? (
                              <span
                                className="inline-block size-2 rounded-full bg-primary/60 align-middle"
                                title="Registered for this day"
                              >
                                <span className="sr-only">Registered</span>
                              </span>
                            ) : standing === "SeriesOnly" ? (
                              // Registered, but nothing ties the registration to
                              // THIS day. Its own glyph on purpose: showing it as
                              // "—" told admins the person was not registered,
                              // while the add-registrant screen refused to add
                              // them because the registration already existed.
                              <span
                                className="inline-block size-2 rounded-full border border-primary/60 align-middle"
                                title="Registered for the series — no sign-up or check-in for this day"
                              >
                                <span className="sr-only">
                                  On the series, not this day
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              <IconCheck className="inline size-3 text-green-600" /> checked in ·{" "}
              <span className="inline-block size-2 rounded-full bg-primary/60 align-middle" />{" "}
              registered for this day ·{" "}
              <span className="inline-block size-2 rounded-full border border-primary/60 align-middle" />{" "}
              on the series only · — not registered
            </p>
            {overview.totals.seriesOnlyPeople > 0 && (
              <p className="text-xs text-muted-foreground">
                {overview.totals.seriesOnlyPeople}{" "}
                {overview.totals.seriesOnlyPeople === 1 ? "person is" : "people are"}{" "}
                registered for a recurring event in this day but have no sign-up
                through the day link and no check-in, so they are listed without
                counting toward the figures above. Checking them in moves them
                into the day.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
