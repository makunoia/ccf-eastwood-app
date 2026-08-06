"use client"

import Link from "next/link"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  attendanceChartConfig,
  ChartEmptyState,
  DonutCenterLabel,
  drillLinkClass,
  formatAverage,
  formatRange,
  formatShortDate,
  formatTooltipDate,
  lifeStageChartConfig,
  periodPhrase,
  pipelineChartConfig,
  placementChartConfig,
  registrationChartConfig,
  seriesChartConfig,
  volunteerChartConfig,
  type EventDashboardData,
  type WidgetProps,
} from "../shared"

/**
 * The card lane. Each card is self-contained — it fetches nothing and reads only
 * the dashboard payload — so the layout resolver can place it at any width, in
 * any order, without the cards knowing about each other.
 */

export function ChartAttendanceSeries({ event }: WidgetProps) {
  const hasData = event.attendanceSeries.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance by Session</CardTitle>
        <CardDescription>
          {hasData
            ? `Check-ins per session over ${periodPhrase(event.period)}`
            : "No sessions in the selected period"}
        </CardDescription>
        {hasData && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pt-2">
            {/* Labelled "participant", never "total" — the Sessions page badge
                counts participants *and* volunteers, and a stat called "total
                check-ins" that omits volunteers is exactly the disagreement
                between the two screens we're closing. */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {event.totalCheckIns.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">participant check-ins</span>
            </div>
            {event.totalVolunteerCheckIns > 0 && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {event.totalVolunteerCheckIns.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">volunteer check-ins</span>
              </div>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium tabular-nums text-foreground">
                {event.sessionsInPeriod.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                {event.sessionsInPeriod === 1 ? "session" : "sessions"}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium tabular-nums text-foreground">
                {formatAverage(event.averageAttendance)}
              </span>
              <span className="text-xs text-muted-foreground">avg per session</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!hasData ? (
          <ChartEmptyState>No sessions have taken place in the selected period.</ChartEmptyState>
        ) : (
          <ChartContainer config={attendanceChartConfig} className="aspect-auto h-65 w-full">
            <AreaChart data={event.attendanceSeries}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={formatShortDate}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={32}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" labelFormatter={formatTooltipDate} />}
              />
              <Area
                dataKey="attendees"
                type="natural"
                fill="var(--color-attendees)"
                fillOpacity={0.1}
                stroke="var(--color-attendees)"
              />
              {/* Only drawn when volunteers actually checked in — the Sessions
                  page badge counts these alongside participants. */}
              {event.totalVolunteerCheckIns > 0 && (
                <Area
                  dataKey="volunteers"
                  type="natural"
                  fill="var(--color-volunteers)"
                  fillOpacity={0.08}
                  stroke="var(--color-volunteers)"
                  strokeDasharray="4 3"
                />
              )}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function ChartRegistrationGrowth({ event }: WidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration Growth</CardTitle>
        <CardDescription>Cumulative registrations in selected period</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {event.registrationSeries.length === 0 ? (
          <ChartEmptyState>No registrations yet in selected period.</ChartEmptyState>
        ) : (
          <ChartContainer config={registrationChartConfig} className="aspect-auto h-65 w-full">
            <AreaChart data={event.registrationSeries}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={formatShortDate}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={32}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" labelFormatter={formatTooltipDate} />}
              />
              <Area
                dataKey="total"
                type="monotone"
                fill="var(--color-total)"
                fillOpacity={0.1}
                stroke="var(--color-total)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function ChartPlacement({ event }: WidgetProps) {
  const total =
    event.placement.inGroup + event.placement.membersUnassigned + event.placement.guestsUnassigned

  const data = [
    { segment: "inGroup", count: event.placement.inGroup, fill: "var(--color-inGroup)" },
    {
      segment: "membersUnassigned",
      count: event.placement.membersUnassigned,
      fill: "var(--color-membersUnassigned)",
    },
    {
      segment: "guestsUnassigned",
      count: event.placement.guestsUnassigned,
      fill: "var(--color-guestsUnassigned)",
    },
  ].filter((slice) => slice.count > 0)

  const inGroupPercent = total > 0 ? Math.round((event.placement.inGroup / total) * 100) : 0

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>DGroup Placement</CardTitle>
        <CardDescription>Participants assigned vs still unassigned</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {total === 0 ? (
          <ChartEmptyState>No participants yet.</ChartEmptyState>
        ) : (
          <ChartContainer config={placementChartConfig} className="mx-auto aspect-square max-h-55">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="count"
                nameKey="segment"
                innerRadius="55%"
                outerRadius="85%"
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => (
                    <DonutCenterLabel
                      viewBox={viewBox}
                      value={`${inGroupPercent}%`}
                      caption="in a group"
                    />
                  )}
                />
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="segment" />}
                className="flex-wrap gap-2"
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
      {event.unassignedCount > 0 && (
        <CardFooter>
          <Link href={`/event/${event.id}/registrants`} className={drillLinkClass}>
            View {event.unassignedCount.toLocaleString()} unassigned →
          </Link>
        </CardFooter>
      )}
    </Card>
  )
}

export function ChartVolunteerStatus({ event }: WidgetProps) {
  const total =
    event.confirmedVolunteerCount + event.pendingVolunteerCount + event.rejectedVolunteerCount

  const data = [
    { status: "confirmed", count: event.confirmedVolunteerCount, fill: "var(--color-confirmed)" },
    { status: "pending", count: event.pendingVolunteerCount, fill: "var(--color-pending)" },
    { status: "rejected", count: event.rejectedVolunteerCount, fill: "var(--color-rejected)" },
  ].filter((slice) => slice.count > 0)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Volunteer Status</CardTitle>
        <CardDescription>Confirmation status across all volunteers</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {total === 0 ? (
          <ChartEmptyState>No volunteers yet.</ChartEmptyState>
        ) : (
          <ChartContainer config={volunteerChartConfig} className="mx-auto aspect-square max-h-55">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                innerRadius="55%"
                outerRadius="85%"
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => (
                    <DonutCenterLabel
                      viewBox={viewBox}
                      value={total.toLocaleString()}
                      caption={total === 1 ? "volunteer" : "volunteers"}
                    />
                  )}
                />
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="status" />}
                className="flex-wrap gap-2"
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter>
        <Link href={`/event/${event.id}/volunteers`} className={drillLinkClass}>
          Manage volunteers →
        </Link>
      </CardFooter>
    </Card>
  )
}

export function ChartPipeline({ event }: WidgetProps) {
  const data = [
    { stage: "Registered", value: event.pipeline.registered },
    { stage: "Attended", value: event.pipeline.attended },
    { stage: "In DGroup", value: event.pipeline.inSmallGroup },
    { stage: "New Timothy", value: event.pipeline.newTimothys },
    { stage: "New Leader", value: event.pipeline.newLeaders },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Discipleship Pipeline</CardTitle>
        <CardDescription>
          From registration to leadership — attendance and new roles use the selected period
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {event.pipeline.registered === 0 ? (
          <ChartEmptyState>No registrants yet.</ChartEmptyState>
        ) : (
          <ChartContainer config={pipelineChartConfig} className="aspect-auto h-55 w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 32 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="stage" type="category" tickLine={false} axisLine={false} width={104} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4}>
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-foreground"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
      {event.confirmedGuestsCount > 0 && (
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            {event.confirmedGuestsCount.toLocaleString()}{" "}
            {event.confirmedGuestsCount === 1 ? "guest" : "guests"} confirmed to a DGroup this
            period
          </p>
        </CardFooter>
      )}
    </Card>
  )
}

export function TableLifeStage({ event }: WidgetProps) {
  const rows = event.attendanceBreakdown.rows
  const total = event.attendanceBreakdown.total

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance by Life Stage</CardTitle>
        <CardDescription>
          First-timers vs members — and how many of those members are already in a DGroup. Counts
          each attendee once for the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total.attendees === 0 ? (
          <ChartEmptyState>No attendance recorded in the selected period yet.</ChartEmptyState>
        ) : (
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <ChartContainer
                config={lifeStageChartConfig}
                className="aspect-auto w-full"
                style={{ height: Math.max(rows.length * 52, 120) + 48 }}
              >
                <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="lifeStageName"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={116}
                    tickFormatter={(value: string) =>
                      value.length > 15 ? `${value.slice(0, 14)}…` : value
                    }
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="firstTimers"
                    stackId="lifeStage"
                    fill="var(--color-firstTimers)"
                    radius={[4, 0, 0, 4]}
                  />
                  <Bar
                    dataKey="membersNotInGroup"
                    stackId="lifeStage"
                    fill="var(--color-membersNotInGroup)"
                  />
                  <Bar
                    dataKey="membersInGroup"
                    stackId="lifeStage"
                    fill="var(--color-membersInGroup)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>

            <div className="xl:col-span-7 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Life Stage</TableHead>
                    <TableHead className="text-right">Attendees</TableHead>
                    <TableHead className="text-right">First-timers</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">In a DGroup</TableHead>
                    <TableHead className="text-right">No DGroup</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.lifeStageId ?? "unspecified"}>
                      <TableCell className="font-medium">{row.lifeStageName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.attendees.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.firstTimers.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.members.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.membersInGroup.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.membersNotInGroup.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">All attendees</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total.attendees.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total.firstTimers.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total.members.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total.membersInGroup.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total.membersNotInGroup.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
      {total.attendees > 0 && (
        <CardFooter className="flex-col items-start gap-2">
          {/* Without this, a single "Not specified" bar reads as a broken report
              rather than as a field nobody was ever asked. */}
          {event.explainMissingLifeStage && (
            <p className="text-xs text-muted-foreground">
              Attendees show as “Not specified” when we have no Life Stage on file and none of this
              event’s forms ask for it.{" "}
              <Link href={`/event/${event.id}/forms`} className={drillLinkClass}>
                Enable Life Stage on a form →
              </Link>
            </p>
          )}
          <Link href={`/event/${event.id}/registrants`} className={drillLinkClass}>
            View registrants →
          </Link>
        </CardFooter>
      )}
    </Card>
  )
}

export function ChartSeriesComparison({ event }: WidgetProps) {
  const summaries = event.seriesSummaries

  return (
    <Card>
      <CardHeader>
        <CardTitle>Series Comparison</CardTitle>
        <CardDescription>
          {summaries.length > 0
            ? "Average attendance per recurring session group"
            : "No recurring series created yet"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a series from the Sessions page to start grouping recurring attendance.
          </p>
        ) : (
          <ChartContainer
            config={seriesChartConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(summaries.length * 48, 96) + 16 }}
          >
            <BarChart data={summaries} layout="vertical" margin={{ left: 0, right: 40 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="title"
                type="category"
                tickLine={false}
                axisLine={false}
                width={140}
                tickFormatter={(value: string) =>
                  value.length > 18 ? `${value.slice(0, 17)}…` : value
                }
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as
                        | EventDashboardData["seriesSummaries"][number]
                        | undefined
                      if (!item) return label
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span>{label}</span>
                          <span className="font-normal text-muted-foreground">
                            {formatRange(item.startDate, item.endDate)} · {item.sessionCount}{" "}
                            {item.sessionCount === 1 ? "session" : "sessions"} ·{" "}
                            {item.totalAttendance.toLocaleString()} total
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />
              <Bar dataKey="averageAttendance" fill="var(--color-averageAttendance)" radius={4}>
                <LabelList
                  dataKey="averageAttendance"
                  position="right"
                  className="fill-foreground"
                  fontSize={12}
                  formatter={formatAverage}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
