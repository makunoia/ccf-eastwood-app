"use client"

import type { DashboardWidgetKey } from "@/lib/events/dashboard-widgets"
import type { WidgetProps } from "../shared"

import {
  KpiAttendance,
  KpiPaid,
  KpiRegistered,
  KpiSessions,
  KpiTotalCheckIns,
  KpiTurnout,
  KpiUnassigned,
  KpiUniqueAttendees,
  KpiVolunteers,
} from "./kpi"
import {
  ChartAttendanceSeries,
  ChartPipeline,
  ChartPlacement,
  ChartRegistrationGrowth,
  ChartSeriesComparison,
  ChartVolunteerStatus,
  TableLifeStage,
} from "./charts"

/**
 * Widget key → component. Typed as a total `Record`, so adding a key to the
 * registry without a component here is a compile error rather than a blank space
 * on someone's dashboard.
 */
export const WIDGET_COMPONENTS: Record<
  DashboardWidgetKey,
  (props: WidgetProps) => React.ReactNode
> = {
  kpiAttendance: KpiAttendance,
  kpiUniqueAttendees: KpiUniqueAttendees,
  kpiTurnout: KpiTurnout,
  kpiUnassigned: KpiUnassigned,
  kpiVolunteers: KpiVolunteers,
  kpiRegistered: KpiRegistered,
  kpiPaid: KpiPaid,
  kpiSessions: KpiSessions,
  kpiTotalCheckIns: KpiTotalCheckIns,
  chartAttendanceSeries: ChartAttendanceSeries,
  chartRegistrationGrowth: ChartRegistrationGrowth,
  chartPlacement: ChartPlacement,
  chartVolunteerStatus: ChartVolunteerStatus,
  chartPipeline: ChartPipeline,
  tableLifeStage: TableLifeStage,
  chartSeriesComparison: ChartSeriesComparison,
}
