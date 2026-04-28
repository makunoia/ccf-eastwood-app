import { notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CatchMechTable, type GroupRow } from "./catch-mech-table"
import { FaciLinkButton } from "./faci-link-button"

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
                  ledGroups: { select: { id: true, name: true }, take: 1 },
                },
              },
            },
          },
          members: {
            select: {
              registrant: {
                select: {
                  memberId: true,
                  guestId: true,
                  member: { select: { firstName: true, lastName: true } },
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

  // Build per-group rows
  const groupRows: GroupRow[] = []
  let totalConfirmed = 0
  let totalRejected = 0
  let totalPending = 0

  for (const bg of event.breakoutGroups) {
    const faciMember = bg.facilitator?.member ?? null
    const isTimothy = faciMember ? faciMember.ledGroups.length === 0 : false
    const ledGroupName = !isTimothy ? (faciMember?.ledGroups[0]?.name ?? null) : null

    const groupRequests = allRequests.filter((r) => r.breakoutGroupId === bg.id)

    let confirmed = 0
    let rejected = 0
    const members: GroupRow["members"] = []

    for (const m of bg.members) {
      const r = m.registrant
      if (!r.memberId && !r.guestId) continue

      // Resolve display name
      let name = "Unknown"
      if (r.memberId && r.member) {
        name = `${r.member.firstName} ${r.member.lastName}`
      } else if (r.guestId && r.guest) {
        name = `${r.guest.firstName} ${r.guest.lastName}`
      }

      // Match to a request record
      const req = groupRequests.find(
        (rq) =>
          (r.memberId && rq.memberId === r.memberId) ||
          (r.guestId && rq.guestId === r.guestId)
      )

      let status: GroupRow["members"][number]["status"] = "Pending"
      if (req?.status === "Confirmed") { status = "Confirmed"; confirmed++ }
      else if (req?.status === "Rejected") { status = "Rejected"; rejected++ }

      members.push({ name, status })
    }

    const total = members.length
    const pending = total - confirmed - rejected

    totalConfirmed += confirmed
    totalRejected += rejected
    totalPending += pending

    groupRows.push({
      id: bg.id,
      name: bg.name,
      faciName: faciMember ? `${faciMember.firstName} ${faciMember.lastName}` : null,
      faciMemberId: faciMember?.id ?? null,
      isTimothy,
      ledGroupName,
      totalMembers: total,
      confirmedCount: confirmed,
      rejectedCount: rejected,
      pendingCount: pending,
      members,
    })
  }

  const totalMembers = totalConfirmed + totalRejected + totalPending

  return {
    groupRows,
    stats: { totalMembers, totalConfirmed, totalRejected, totalPending },
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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="type-headline">Catch Mech</h2>
          <p className="text-sm text-muted-foreground">
            Track small group confirmations from breakout groups
          </p>
        </div>
        <FaciLinkButton url={publicUrl} />
      </div>

      {/* Stats + weekly progress on the same row */}
      <div className="flex items-stretch gap-3">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3 flex-1">
          {[
            { label: "Total Members", value: stats.totalMembers, color: "", pct: null, slug: null },
            { label: "Confirmed", value: stats.totalConfirmed, color: "text-green-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalConfirmed / stats.totalMembers) * 100) : 0, slug: "confirmed" },
            { label: "Rejected", value: stats.totalRejected, color: "text-red-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalRejected / stats.totalMembers) * 100) : 0, slug: "rejected" },
            { label: "Pending", value: stats.totalPending, color: "text-amber-600", pct: stats.totalMembers > 0 ? Math.round((stats.totalPending / stats.totalMembers) * 100) : 0, slug: "pending" },
          ].map(({ label, value, color, pct, slug }) => {
            const inner = (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
                  {label}
                </p>
                <p className={`text-3xl font-semibold tabular-nums tracking-tight ${color || "text-foreground"}`}>
                  {value}
                </p>
              </div>
            )
            return slug ? (
              <Link
                key={label}
                href={`/event/${id}/catch-mech/${slug}`}
                className="rounded-lg border px-5 py-4 flex flex-col justify-between hover:bg-muted/40 transition-colors"
              >
                {inner}
                {pct !== null && (
                  <p className="text-xs text-muted-foreground">{pct}% of total</p>
                )}
              </Link>
            ) : (
              <div
                key={label}
                className="rounded-lg border px-5 py-4 flex flex-col justify-between"
              >
                {inner}
              </div>
            )
          })}
        </div>

        {/* Weekly progress */}
        {weeklyProgress.length > 0 && (
          <div className="rounded-lg border overflow-hidden shrink-0 flex flex-col">
            <div className="overflow-y-auto flex-1">
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
        <CatchMechTable groupRows={groupRows} />
      </section>
    </div>
  )
}
