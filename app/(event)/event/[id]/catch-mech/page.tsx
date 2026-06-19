import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { db } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { CatchMechTable } from "./catch-mech-table"
import { FaciLinkButton } from "./faci-link-button"
import { buildCatchMechGroupRows } from "./aggregate"

function getISOWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - 3)
  return `Wk ${weekNum} · ${monday.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
}

async function getCatchMechData(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      modules: { select: { type: true } },
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          facilitatorId: true,
          facilitator: {
            select: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  ledGroups: { select: { id: true, name: true }, orderBy: { name: "asc" } },
                },
              },
            },
          },
          members: {
            select: {
              registrant: {
                select: {
                  id: true,
                  memberId: true,
                  guestId: true,
                  member: { select: { firstName: true, lastName: true, smallGroupId: true } },
                  guest: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null

  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)

  // Fetch all requests for these breakout groups (single query)
  const allRequests = await db.smallGroupMemberRequest.findMany({
    where: { breakoutGroupId: { in: breakoutGroupIds } },
    select: {
      id: true,
      breakoutGroupId: true,
      memberId: true,
      guestId: true,
      status: true,
      resolvedAt: true,
    },
  })

  // Weekly progress: confirmed requests grouped by ISO week
  const weeklyMap: Record<string, number> = {}
  for (const req of allRequests) {
    if (req.status !== "Confirmed" || !req.resolvedAt) continue
    const label = getISOWeekLabel(req.resolvedAt)
    weeklyMap[label] = (weeklyMap[label] ?? 0) + 1
  }
  const weeklyProgress = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)

  // Build per-group rows + aggregate stats (pure, see aggregate.ts)
  const { groupRows, stats } = buildCatchMechGroupRows(event.breakoutGroups, allRequests)

  return {
    groupRows,
    stats,
    weeklyProgress,
  }
}

export default async function CatchMechAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getCatchMechData(id)
  if (!data) notFound()

  const { groupRows, stats, weeklyProgress } = data
  const publicUrl = `/events/${id}/catch-mech`

  const session = await auth()
  const canViewMember = canRead(session, "Members")

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        title="Catch Mech"
        description="Track small group confirmations from breakout groups"
        actions={<FaciLinkButton url={publicUrl} />}
      />

      {/* Stats + weekly progress */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
          {[
            { label: "Total Members", value: stats.totalMembers, color: "", pct: null, slug: null },
            { label: "Confirmed", value: stats.totalConfirmed, color: "text-green-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalConfirmed / stats.totalMembers) * 100) : 0, slug: "confirmed" },
            { label: "Rejected", value: stats.totalRejected, color: "text-red-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalRejected / stats.totalMembers) * 100) : 0, slug: "rejected" },
            { label: "Pending", value: stats.totalPending, color: "text-amber-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalPending / stats.totalMembers) * 100) : 0, slug: "pending" },
          ].map(({ label, value, color, pct, slug }) => {
            return slug ? (
              <Link
                key={label}
                href={`/event/${id}/catch-mech/${slug}`}
                className="group rounded-lg border px-5 py-4 flex flex-col justify-between hover:bg-muted/60 hover:border-foreground/20 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
                      {label}
                    </p>
                    <p className={`text-3xl font-semibold tabular-nums tracking-tight ${color || "text-foreground"}`}>
                      {value}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors shrink-0 mt-0.5" />
                </div>
                {pct !== null && (
                  <p className="text-xs text-muted-foreground mt-2">{pct}% of total</p>
                )}
              </Link>
            ) : (
              <div
                key={label}
                className="rounded-lg border px-5 py-4 flex flex-col justify-between"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
                    {label}
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    {value}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Weekly progress */}
        {weeklyProgress.length > 0 && (
          <div className="rounded-lg border overflow-hidden shrink-0 flex flex-col lg:w-56">
            <div className="overflow-y-auto lg:max-h-52">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background z-10">Week</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-right">Confirmations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyProgress.map(([label, count]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right font-medium">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Per-group table */}
      <section className="space-y-3">
        <h3 className="type-label text-muted-foreground">Breakout Groups</h3>
        <CatchMechTable groupRows={groupRows} canViewMember={canViewMember} eventId={id} />
      </section>
    </div>
  )
}
