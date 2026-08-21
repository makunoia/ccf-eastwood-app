import type { CSVCell } from "@/lib/csv-export"
import type { EventModuleType } from "@/app/generated/prisma/client"
import {
  buildExportColumns,
  buildExportTable,
  sortByGroup,
  type ExportColumnDef,
  type ExportColumnState,
} from "./columns"
import {
  eventVolunteerColumns,
  VOLUNTEER_EXPORT_GROUPS,
  type EventVolunteerExportRow,
  type VolunteerExportGroup,
} from "./event-volunteers"

/**
 * Column model for a Collab day's serving team.
 *
 * The event registry plus one column, rather than a registry of its own: a
 * volunteer's record is identical whichever screen you export it from, and a
 * second copy of nineteen column definitions would drift the first time someone
 * added a field to one. The event columns are reused verbatim, so an export from
 * the day and an export from either ministry's event round-trip through the same
 * importer.
 *
 * The one addition is **Signed Up Under** — which ministry the person is serving
 * with. On the day's screen it is the column that stops two rosters reading as
 * one list, and it is `optional` because the label is a fact about the day's
 * shape rather than something anybody was asked.
 *
 * The Embarkation gate is the union across the day's member events, for the same
 * reason `getClusterFormCoverage` unions form configs: the row's own event is
 * what gathered the value, and a day-level export that hid one ministry's bus
 * assignments because the *other* ministry has no Embarkation module would be
 * dropping answers that exist.
 */

export type ClusterVolunteerExportRow = EventVolunteerExportRow & {
  /** The ministry (or, failing that, the event) this sign-up is filed under. */
  ministry: string
}

type ColumnDef = ExportColumnDef<ClusterVolunteerExportRow, VolunteerExportGroup>

export type ClusterVolunteerExportColumnState = ExportColumnState<VolunteerExportGroup>

const MINISTRY_COLUMN: ColumnDef = {
  key: "ministry",
  label: "Signed Up Under",
  group: "Serving",
  toggle: null,
  optional: true,
  value: (r) => r.ministry,
}

export function clusterVolunteerColumns(): ColumnDef[] {
  // The event columns read a narrower row than this one, which is exactly the
  // assignability that lets them be reused unchanged. Ministry leads the Serving
  // group — `sortByGroup` is stable, so declared order holds within a group —
  // because it is the first thing you look for on a two-ministry list.
  const inherited: ColumnDef[] = eventVolunteerColumns()
  return sortByGroup([MINISTRY_COLUMN, ...inherited], VOLUNTEER_EXPORT_GROUPS)
}

export function buildClusterVolunteerColumns(
  modules: EventModuleType[],
  rows: ClusterVolunteerExportRow[],
): ClusterVolunteerExportColumnState[] {
  return buildExportColumns(clusterVolunteerColumns(), rows, (column) =>
    column.module ? modules.includes(column.module) : false,
  )
}

/** Table for the chosen columns, in registry order. */
export function buildClusterVolunteersTable(
  rows: ClusterVolunteerExportRow[],
  selectedKeys: string[],
): { headers: string[]; cells: CSVCell[][] } {
  return buildExportTable(clusterVolunteerColumns(), rows, selectedKeys)
}
