import { db } from "@/lib/db"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { GuestsPending } from "@/components/dashboard/guests-pending"
import { SmallGroupsOverview } from "@/components/dashboard/small-groups-overview"

export default async function DashboardPage() {
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
    rawGuestRegistrations,
    recentGuests,
    recentSmallGroups,
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
        lifeStage: { select: { name: true } },
        _count: { select: { members: true } },
      },
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
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards stats={stats} />
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
