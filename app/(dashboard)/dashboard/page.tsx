import type { Metadata } from "next"
import { db } from "@/lib/db"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { GuestsPending } from "@/components/dashboard/guests-pending"
import { SmallGroupsOverview } from "@/components/dashboard/small-groups-overview"
import { FilterableStatCards } from "@/components/dashboard/filterable-stat-cards"

export const metadata: Metadata = {
  title: "Dashboard",
}

const PERIOD_LABELS: Record<string, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
  year: "This Year",
}

function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case "quarter":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case "year":
      return new Date(now.getFullYear(), 0, 1)
    default: // month
      return new Date(now.getFullYear(), now.getMonth(), 1)
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const sp = await searchParams
  const period = sp.period && PERIOD_LABELS[sp.period] ? sp.period : "month"
  const periodStart = getPeriodStart(period)

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000)

  const [
    totalMembers,
    newMembersThisMonth,
    activeGuests,
    newGuestsThisWeek,
    totalSmallGroups,
    newGroupsThisMonth,
    connectedThisMonth,
    membersWithoutGroup,
    totalLeaders,
    rawGuestRegistrations,
    recentGuests,
    recentSmallGroups,
    // Period-filtered stats
    guestsInPeriod,
    leadersInPeriod,
    volunteersInPeriod,
    newVolunteersInPeriod,
  ] = await Promise.all([
    db.member.count(),
    db.member.count({ where: { dateJoined: { gte: startOfThisMonth } } }),
    db.guest.count({ where: { memberId: null } }),
    db.eventRegistrant.count({
      where: { guestId: { not: null }, createdAt: { gte: startOfLastWeek } },
    }),
    db.smallGroup.count(),
    db.smallGroup.count({ where: { createdAt: { gte: startOfThisMonth } } }),
    db.guest.count({
      where: {
        memberId: { not: null },
        member: { dateJoined: { gte: startOfThisMonth } },
      },
    }),
    db.member.count({ where: { smallGroupId: null } }),
    db.member.count({ where: { ledGroups: { some: {} } } }),
    db.eventRegistrant.findMany({
      where: { guestId: { not: null }, createdAt: { gte: twelveWeeksAgo } },
      select: { createdAt: true },
    }),
    db.guest.findMany({
      where: { memberId: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: { select: { eventRegistrations: true } },
      },
    }),
    db.smallGroup.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        leader: { select: { firstName: true, lastName: true } },
        lifeStages: { select: { name: true }, orderBy: { order: "asc" } },
        _count: { select: { members: true } },
      },
    }),
    // New guests registered in period
    db.eventRegistrant.count({
      where: { guestId: { not: null }, createdAt: { gte: periodStart } },
    }),
    // Members who became leaders in period (joined + have led groups)
    db.member.count({
      where: {
        dateJoined: { gte: periodStart },
        ledGroups: { some: {} },
      },
    }),
    // Confirmed volunteer assignments created in period
    db.volunteer.count({
      where: { status: "Confirmed", createdAt: { gte: periodStart } },
    }),
    // New volunteer sign-ups (Pending) created in period
    db.volunteer.count({
      where: { status: "Pending", createdAt: { gte: periodStart } },
    }),
  ])

  // Group guest registrations by ISO week start (Monday) for the last 12 weeks
  const weeklyMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    weeklyMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const r of rawGuestRegistrations) {
    const d = new Date(r.createdAt)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    if (weeklyMap.has(key)) weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + 1)
  }
  const weeklyGuestData = Array.from(weeklyMap, ([week, guests]) => ({
    week,
    guests,
  }))

  const stats = {
    totalMembers,
    newMembersThisMonth,
    activeGuests,
    newGuestsThisWeek,
    totalSmallGroups,
    newGroupsThisMonth,
    connectedThisMonth,
    membersWithoutGroup,
    totalLeaders,
  }

  const filterableStats = {
    guests: guestsInPeriod,
    leaders: leadersInPeriod,
    volunteers: volunteersInPeriod,
    newVolunteers: newVolunteersInPeriod,
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards stats={stats} />
        <FilterableStatCards
          stats={filterableStats}
          period={period}
          periodLabel={PERIOD_LABELS[period]}
        />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive data={weeklyGuestData} />
        </div>
        <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2">
          <GuestsPending
            guests={recentGuests}
            totalActiveGuests={activeGuests}
          />
          <SmallGroupsOverview
            groups={recentSmallGroups}
            totalGroups={totalSmallGroups}
          />
        </div>
      </div>
    </div>
  )
}
