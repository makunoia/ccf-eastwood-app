"use client"

import Link from "next/link"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type {
  AssistantEventRow,
  AssistantGroupRow,
  AssistantGuestRow,
  AssistantList,
  AssistantMatchRow,
  AssistantMemberRow,
  AssistantMinistryRow,
  AssistantRegistrantRow,
  AssistantVolunteerRow,
} from "@/lib/assistant/serializers"
import type { EventAttendanceStats } from "@/lib/assistant/queries"

// Standard identifier-column link style (CLAUDE.md table convention).
const LINK_CLASS =
  "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

// ─── Generic result table ────────────────────────────────────────────────────

type Column<T> = {
  header: string
  render: (row: T) => React.ReactNode
}

function ResultTable<T extends { id: string }>({
  list,
  columns,
  emptyLabel,
}: {
  list: AssistantList<T>
  columns: Column<T>[]
  emptyLabel: string
}) {
  if (list.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <div className="rounded-md border">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((c) => (
                <th key={c.header} className="px-2 py-1.5 text-left font-medium">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.header} className="px-2 py-1.5 align-top">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.truncated && (
        <p className="border-t px-2 py-1 text-[11px] text-muted-foreground">
          Showing {list.rows.length} of {list.totalCount} — refine the search to narrow
          results.
        </p>
      )}
    </div>
  )
}

// ─── Per-tool renderers ──────────────────────────────────────────────────────

function MembersTable({ list }: { list: AssistantList<AssistantMemberRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No members found."
      columns={[
        {
          header: "Name",
          render: (m) => (
            <Link href={`/members/${m.id}`} className={LINK_CLASS}>
              {m.name}
            </Link>
          ),
        },
        { header: "Phone", render: (m) => m.phone ?? "—" },
        { header: "Life stage", render: (m) => m.lifeStage ?? "—" },
        { header: "DGroup", render: (m) => m.smallGroup ?? "—" },
      ]}
    />
  )
}

function GuestsTable({ list }: { list: AssistantList<AssistantGuestRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No guests found."
      columns={[
        {
          header: "Name",
          render: (g) => (
            <Link href={`/guests/${g.id}`} className={LINK_CLASS}>
              {g.name}
            </Link>
          ),
        },
        { header: "Phone", render: (g) => g.phone ?? "—" },
        { header: "Life stage", render: (g) => g.lifeStage ?? "—" },
        {
          header: "Status",
          render: (g) =>
            g.promoted ? <Badge variant="secondary">Promoted</Badge> : "Active",
        },
      ]}
    />
  )
}

function GroupsTable({ list }: { list: AssistantList<AssistantGroupRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No DGroups found."
      columns={[
        {
          header: "Group",
          render: (g) => (
            <Link href={`/small-groups/${g.id}`} className={LINK_CLASS}>
              {g.name}
            </Link>
          ),
        },
        { header: "Leader", render: (g) => g.leader ?? "—" },
        {
          header: "Members",
          render: (g) => `${g.memberCount}${g.memberLimit ? `/${g.memberLimit}` : ""}`,
        },
        { header: "Schedule", render: (g) => g.schedule ?? "—" },
      ]}
    />
  )
}

function MinistriesTable({ list }: { list: AssistantList<AssistantMinistryRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No ministries found."
      columns={[
        { header: "Ministry", render: (m) => <span className="font-medium">{m.name}</span> },
        { header: "Life stage", render: (m) => m.lifeStage ?? "—" },
        { header: "Events", render: (m) => m.eventCount },
      ]}
    />
  )
}

function EventsTable({ list }: { list: AssistantList<AssistantEventRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No events found."
      columns={[
        {
          header: "Event",
          render: (e) => (
            <Link href={`/event/${e.id}/dashboard`} className={LINK_CLASS}>
              {e.name}
            </Link>
          ),
        },
        { header: "Type", render: (e) => e.type },
        { header: "Start", render: (e) => e.startDate ?? "—" },
        { header: "Registrants", render: (e) => e.registrantCount },
      ]}
    />
  )
}

function RegistrantsTable({ list }: { list: AssistantList<AssistantRegistrantRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No registrants found."
      columns={[
        { header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { header: "Kind", render: (r) => r.kind },
        {
          header: "Paid",
          render: (r) =>
            r.isPaid ? <Badge variant="secondary">Paid</Badge> : "—",
        },
        {
          header: "Attended",
          render: (r) => (r.attended ? <Badge variant="secondary">Yes</Badge> : "—"),
        },
      ]}
    />
  )
}

function VolunteersTable({ list }: { list: AssistantList<AssistantVolunteerRow> }) {
  return (
    <ResultTable
      list={list}
      emptyLabel="No volunteers found."
      columns={[
        {
          header: "Name",
          render: (v) => (
            <Link href={`/members/${v.memberId}`} className={LINK_CLASS}>
              {v.name}
            </Link>
          ),
        },
        { header: "Event", render: (v) => v.event },
        { header: "Committee", render: (v) => v.committee },
        {
          header: "Status",
          render: (v) => (
            <Badge variant={v.status === "Confirmed" ? "secondary" : "outline"}>
              {v.status}
            </Badge>
          ),
        },
      ]}
    />
  )
}

// ─── Matching ────────────────────────────────────────────────────────────────

function MatchList({ matches }: { matches: AssistantMatchRow[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No compatible groups found.</p>
  }
  return (
    <div className="space-y-1.5">
      {matches.map((m, i) => (
        <div
          key={m.groupId}
          className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
        >
          <div className="min-w-0">
            <Link href={`/small-groups/${m.groupId}`} className={`${LINK_CLASS} text-sm`}>
              {i + 1}. {m.groupName}
            </Link>
            {m.onCooldown && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                Cooldown
              </Badge>
            )}
          </div>
          <Badge variant="secondary">{Math.round(m.totalScore * 100)}%</Badge>
        </div>
      ))}
    </div>
  )
}

// ─── Attendance stats ────────────────────────────────────────────────────────

const attendanceChartConfig = {
  attendeeCount: {
    label: "Attendees",
    color: "var(--primary)",
  },
} satisfies ChartConfig

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  )
}

function AttendanceStats({ stats }: { stats: EventAttendanceStats }) {
  return (
    <Card className="py-3">
      <CardContent className="space-y-3 px-3">
        <p className="text-sm font-medium">{stats.eventName}</p>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Registrants" value={stats.totalRegistrants} />
          {stats.oneTime ? (
            <StatTile label="Attended" value={stats.oneTime.attendedCount} />
          ) : (
            <StatTile label="Sessions" value={stats.sessions.length} />
          )}
          {stats.oneTime && (
            <StatTile label="Volunteers present" value={stats.oneTime.volunteersPresent} />
          )}
        </div>
        {stats.sessions.length > 0 && (
          <ChartContainer config={attendanceChartConfig} className="h-40 w-full">
            <BarChart data={stats.sessions}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(v: string) => (v ? v.slice(5) : "")}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} fontSize={10} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="attendeeCount"
                fill="var(--color-attendeeCount)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Detail / fallback rendering ─────────────────────────────────────────────

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** Generic key/value card for detail tools and anything without a bespoke renderer. */
function DetailCard({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object"
  )
  if (entries.length === 0) return null
  return (
    <Card className="py-2.5">
      <CardContent className="px-3">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{labelize(k)}</dt>
              <dd className="font-medium break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/** Human-readable "working…" labels shown while a tool call is in flight. */
export const TOOL_LOADING_LABELS: Record<string, string> = {
  list_life_stages: "Loading life stages…",
  search_members: "Searching members…",
  get_member_details: "Loading member profile…",
  search_guests: "Searching guests…",
  get_guest_details: "Loading guest profile…",
  check_duplicate_contact: "Checking for duplicates…",
  search_small_groups: "Searching DGroups…",
  get_small_group_details: "Loading group details…",
  match_small_groups: "Running the matching engine…",
  list_ministries: "Loading ministries…",
  search_events: "Searching events…",
  get_event_details: "Loading event details…",
  get_event_attendance_stats: "Computing attendance stats…",
  search_event_registrants: "Searching registrants…",
  search_volunteers: "Searching volunteers…",
  get_entity_counts: "Counting records…",
  create_member: "Creating member…",
  update_member: "Updating member…",
  create_guest: "Creating guest…",
  update_guest: "Updating guest…",
  promote_guest_to_member: "Promoting guest…",
  add_member_to_small_group: "Adding to group…",
  assign_guest_to_group_temporarily: "Creating group assignment…",
  mark_registrant_paid: "Marking as paid…",
  mark_registrant_attended: "Marking attendance…",
}

/**
 * Render a completed tool output. `toolName` is the bare tool name
 * (part type minus the "tool-" prefix); `output` is the tool's return value.
 */
export function renderToolOutput(toolName: string, output: unknown): React.ReactNode {
  if (output == null) return null
  const o = output as Record<string, unknown>

  // Uniform permission/not-found errors from any tool.
  if (typeof o.error === "string") {
    return <p className="text-sm text-destructive">{o.error}</p>
  }
  // Write-tool ActionResult errors.
  if (o.success === false && typeof o.error === "string") {
    return <p className="text-sm text-destructive">{String(o.error)}</p>
  }

  switch (toolName) {
    case "search_members":
      return <MembersTable list={output as AssistantList<AssistantMemberRow>} />
    case "search_guests":
      return <GuestsTable list={output as AssistantList<AssistantGuestRow>} />
    case "search_small_groups":
      return <GroupsTable list={output as AssistantList<AssistantGroupRow>} />
    case "list_ministries":
      return <MinistriesTable list={output as AssistantList<AssistantMinistryRow>} />
    case "search_events":
      return <EventsTable list={output as AssistantList<AssistantEventRow>} />
    case "search_event_registrants":
      return <RegistrantsTable list={output as AssistantList<AssistantRegistrantRow>} />
    case "search_volunteers":
      return <VolunteersTable list={output as AssistantList<AssistantVolunteerRow>} />
    case "match_small_groups":
      return <MatchList matches={(o.matches ?? []) as AssistantMatchRow[]} />
    case "get_event_attendance_stats":
      return <AttendanceStats stats={output as EventAttendanceStats} />
    case "get_member_details":
    case "get_guest_details":
    case "get_small_group_details":
    case "get_event_details":
    case "get_entity_counts":
      return <DetailCard data={o} />
    case "list_life_stages":
    case "check_duplicate_contact":
      // Model-facing lookups — no visual payload needed.
      return null
    default:
      // Write-tool success results and anything new: minimal confirmation.
      if (o.success === true) {
        return <p className="text-sm text-emerald-600 dark:text-emerald-500">Done.</p>
      }
      return null
  }
}
