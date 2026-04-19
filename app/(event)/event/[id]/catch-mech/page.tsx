import { notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
          coFacilitatorId: true,
          facilitator: {
            select: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  ledGroups: { select: { id: true }, take: 1 },
                },
              },
            },
          },
          members: {
            select: {
              registrantId: true,
              registrant: {
                select: {
                  memberId: true,
                  guestId: true,
                  guest: { select: { memberId: true } },
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

  // Get the IDs of all breakout groups in this event for weekly progress query
  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)

  // Weekly progress: count SmallGroupMemberRequests confirmed this week from these breakout groups
  const confirmedRequests = await db.smallGroupMemberRequest.findMany({
    where: {
      breakoutGroupId: { in: breakoutGroupIds },
      status: "Confirmed",
      resolvedAt: { not: null },
    },
    select: { resolvedAt: true },
  })

  // Group by ISO week
  const weeklyMap: Record<string, number> = {}
  for (const req of confirmedRequests) {
    if (!req.resolvedAt) continue
    const label = getISOWeekLabel(req.resolvedAt)
    weeklyMap[label] = (weeklyMap[label] ?? 0) + 1
  }
  const weeklyProgress = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8) // last 8 weeks

  // Build per-group stats
  type GroupRow = {
    id: string
    name: string
    faciName: string | null
    isTimothy: boolean
    totalMembers: number
    confirmedCount: number
  }

  const groupRows: GroupRow[] = []
  let totalConfirmed = 0
  let totalPending = 0

  for (const bg of event.breakoutGroups) {
    const faciMember = bg.facilitator?.member ?? null
    const isTimothy = faciMember ? faciMember.ledGroups.length === 0 : false
    const leadingGroupId = faciMember && !isTimothy ? faciMember.ledGroups[0]?.id : null

    let confirmed = 0
    for (const m of bg.members) {
      const r = m.registrant
      if (!r.memberId && !r.guestId) continue
      if (r.guestId && r.guest?.memberId) {
        // Was promoted — check if they ended up in faci's group
        confirmed++
        continue
      }
      if (r.memberId && leadingGroupId) {
        const member = await db.member.findUnique({
          where: { id: r.memberId },
          select: { smallGroupId: true },
        })
        if (member?.smallGroupId === leadingGroupId) confirmed++
      }
    }

    const total = bg.members.filter(
      (m) => m.registrant.memberId || m.registrant.guestId
    ).length
    const pending = total - confirmed

    totalConfirmed += confirmed
    totalPending += pending

    groupRows.push({
      id: bg.id,
      name: bg.name,
      faciName: faciMember
        ? `${faciMember.firstName} ${faciMember.lastName}`
        : null,
      isTimothy,
      totalMembers: total,
      confirmedCount: confirmed,
    })
  }

  const totalMembers = totalConfirmed + totalPending

  return {
    event,
    groupRows,
    stats: { totalMembers, totalConfirmed, totalPending },
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

  const { event: _event, groupRows, stats, weeklyProgress } = data
  const publicUrl = `/events/${id}/catch-mech`

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Catch Mech</h2>
          <p className="text-sm text-muted-foreground">Track small group confirmations from breakout groups</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Faci link:</span>
          <Link
            href={publicUrl}
            target="_blank"
            className="text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors"
          >
            {publicUrl}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.totalConfirmed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.totalPending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-group table */}
      <section className="space-y-3 max-w-3xl">
        <h3 className="text-sm font-medium text-muted-foreground">Breakout Groups</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Group</th>
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Facilitator</th>
                <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">Members</th>
                <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">Confirmed</th>
                <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groupRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">
                    {row.faciName ? (
                      <div className="flex items-center gap-2">
                        <span>{row.faciName}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${row.isTimothy ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}
                        >
                          {row.isTimothy ? "Timothy" : "Leader"}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{row.totalMembers}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{row.confirmedCount}</td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {row.totalMembers - row.confirmedCount}
                  </td>
                </tr>
              ))}
              {groupRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                    No breakout groups yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weekly progress */}
      {weeklyProgress.length > 0 && (
        <section className="space-y-3 max-w-md">
          <h3 className="text-sm font-medium text-muted-foreground">Weekly Progress</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Week</th>
                  <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">New Confirmations</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weeklyProgress.map(([label, count]) => (
                  <tr key={label}>
                    <td className="px-4 py-2">{label}</td>
                    <td className="px-4 py-2 text-right font-medium">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
