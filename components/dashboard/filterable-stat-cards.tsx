import { Suspense } from "react"
import {
  IconUserPlus,
  IconUserStar,
  IconUserCheck,
  IconClockHour4,
} from "@tabler/icons-react"
import { PeriodSelector } from "./period-selector"

type FilterableStats = {
  guests: number
  leaders: number
  volunteers: number
  newVolunteers: number
}

type FilterableStatCardsProps = {
  stats: FilterableStats
  period: string
  periodLabel: string
}

type StatCardProps = {
  label: string
  value: number
  sub: string
  icon: React.ReactNode
}

function StatCard({ label, value, sub, icon }: StatCardProps) {
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
      <p className="text-xs text-muted-foreground/60">{sub}</p>
    </div>
  )
}

export function FilterableStatCards({
  stats,
  period,
  periodLabel,
}: FilterableStatCardsProps) {
  return (
    <div className="px-4 lg:px-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Activity — {periodLabel}
        </p>
        <Suspense>
          <PeriodSelector currentPeriod={period} />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
        <StatCard
          label="Guests"
          value={stats.guests}
          sub="New guest registrations"
          icon={<IconUserPlus className="size-4" />}
        />
        <StatCard
          label="New Leaders"
          value={stats.leaders}
          sub="Members who became leaders"
          icon={<IconUserStar className="size-4" />}
        />
        <StatCard
          label="Volunteers"
          value={stats.volunteers}
          sub="Confirmed volunteer assignments"
          icon={<IconUserCheck className="size-4" />}
        />
        <StatCard
          label="New Volunteers"
          value={stats.newVolunteers}
          sub="Pending volunteer sign-ups"
          icon={<IconClockHour4 className="size-4" />}
        />
      </div>
    </div>
  )
}
