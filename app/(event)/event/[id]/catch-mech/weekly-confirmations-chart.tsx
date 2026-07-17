"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { WeeklyBucket } from "./weekly-buckets"

const chartConfig = {
  count: { label: "Confirmations", color: "var(--chart-2)" },
} satisfies ChartConfig

export function WeeklyConfirmationsChart({
  buckets,
  totalConfirmed,
}: {
  buckets: WeeklyBucket[]
  /** All-time confirmations, used to tell "never any" apart from "none lately". */
  totalConfirmed: number
}) {
  const windowTotal = buckets.reduce((sum, b) => sum + b.count, 0)
  const range =
    buckets.length > 0
      ? `${buckets[0].label} – ${buckets[buckets.length - 1].label}`
      : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmation Velocity</CardTitle>
        <CardDescription>
          Confirmations per week · {range}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {/* An all-zero window is real signal (the flow has stalled) rather than an
            error — but only worth a chart if confirmations exist at all. */}
        {totalConfirmed === 0 ? (
          <ChartEmptyState>No confirmations yet.</ChartEmptyState>
        ) : windowTotal === 0 ? (
          <ChartEmptyState>
            No confirmations in the last {buckets.length} weeks.
          </ChartEmptyState>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-65 w-full">
            <BarChart data={buckets}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis width={32} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(_, payload) => {
                      const weekStart = payload?.[0]?.payload?.weekStart
                      if (!weekStart) return ""
                      return `Week of ${new Date(weekStart).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    }}
                  />
                }
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function ChartEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-45 items-center justify-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
