import { IconUsers, IconUserPlus, IconUsersGroup, IconArrowRight } from "@tabler/icons-react"

type DashboardStats = {
  totalMembers: number
  newMembersThisMonth: number
  activeGuests: number
  newGuestsThisWeek: number
  totalSmallGroups: number
  newGroupsThisMonth: number
  connectedThisMonth: number
  membersWithoutGroup: number
}

type StatCardProps = {
  label: string
  value: number
  delta: string
  sub?: string
  icon: React.ReactNode
}

function StatCard({ label, value, delta, sub, icon }: StatCardProps) {
  return (
    <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground/40">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value.toLocaleString()}
      </p>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-[#2AB9D0] font-medium">{delta}</p>
        {sub && <p className="text-xs text-muted-foreground/60">{sub}</p>}
      </div>
    </div>
  )
}

export function SectionCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        label="Members"
        value={stats.totalMembers}
        delta={`+${stats.newMembersThisMonth} this month`}
        sub={`${stats.membersWithoutGroup} not yet in a group`}
        icon={<IconUsers className="size-4" />}
      />
      <StatCard
        label="Active Guests"
        value={stats.activeGuests}
        delta={`+${stats.newGuestsThisWeek} this week`}
        sub="Awaiting small group placement"
        icon={<IconUserPlus className="size-4" />}
      />
      <StatCard
        label="Small Groups"
        value={stats.totalSmallGroups}
        delta={`+${stats.newGroupsThisMonth} this month`}
        icon={<IconUsersGroup className="size-4" />}
      />
      <StatCard
        label="Connected"
        value={stats.connectedThisMonth}
        delta="Guests → Members"
        sub="Promoted this month"
        icon={<IconArrowRight className="size-4" />}
      />
    </div>
  )
}
