import type { CSVCell } from "@/lib/csv-export"
import type { EventModuleType } from "@/app/generated/prisma/client"
import {
  buildExportColumns,
  buildExportTable,
  formatManilaDateTime,
  sortByGroup,
  type ExportColumnDef,
  type ExportColumnState,
} from "./columns"

/**
 * Column model for a single event's volunteers export.
 *
 * A volunteer answers the volunteer form, not the registration one, so there is
 * no `EventFormConfigData` behind these columns — the serving fields are always
 * gathered, and the profile fields are `optional`, present when the roster
 * actually holds them. The one real gate is Embarkation: bus assignments are a
 * module's records, kept (like every other gated column) when the module is off
 * but the records remain.
 *
 * The first four columns and their labels match `VOLUNTEER_HEADERS` in
 * `lib/export-entities.ts` so an export → re-import still round-trips: "Role
 * Name" is the *preferred* role, which is what the importer reads.
 */

export type EventVolunteerExportRow = {
  volunteerId: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  lifeStage: string | null
  gender: string | null
  birthDate: string | null
  smallGroup: string | null

  committeeName: string
  preferredRole: string
  assignedRole: string | null
  status: string
  notes: string | null
  leaderNotes: string | null
  signedUpAt: string // ISO datetime

  bus: string | null
  busDirection: string | null
}

export const VOLUNTEER_EXPORT_GROUPS = [
  "Personal Information",
  "Serving",
  "Embarkation",
] as const

export type VolunteerExportGroup = (typeof VOLUNTEER_EXPORT_GROUPS)[number]

type ColumnDef = ExportColumnDef<EventVolunteerExportRow, VolunteerExportGroup>

export type VolunteerExportColumnState = ExportColumnState<VolunteerExportGroup>

const COLUMNS: readonly ColumnDef[] = [
  // ── Personal Information ──
  { key: "firstName", label: "First Name", group: "Personal Information", toggle: null, value: (r) => r.firstName },
  { key: "lastName", label: "Last Name", group: "Personal Information", toggle: null, value: (r) => r.lastName },
  { key: "email", label: "Email", group: "Personal Information", toggle: null, value: (r) => r.email },
  { key: "phone", label: "Phone", group: "Personal Information", toggle: null, value: (r) => r.phone },
  { key: "nickname", label: "Nickname", group: "Personal Information", toggle: null, optional: true, value: (r) => r.nickname },
  { key: "lifeStage", label: "Life Stage", group: "Personal Information", toggle: null, optional: true, value: (r) => r.lifeStage },
  { key: "gender", label: "Gender", group: "Personal Information", toggle: null, optional: true, value: (r) => r.gender },
  { key: "birthDate", label: "Birth Month + Year", group: "Personal Information", toggle: null, optional: true, value: (r) => r.birthDate },
  { key: "smallGroup", label: "DGroup", group: "Personal Information", toggle: null, optional: true, value: (r) => r.smallGroup },

  // ── Serving ──
  { key: "committeeName", label: "Committee Name", group: "Serving", toggle: null, value: (r) => r.committeeName },
  // "Role Name" rather than "Preferred Role": it aligns to the importer's
  // roleName field, which is what makes an export → re-import round-trip.
  { key: "preferredRole", label: "Role Name", group: "Serving", toggle: null, value: (r) => r.preferredRole },
  { key: "assignedRole", label: "Assigned Role", group: "Serving", toggle: null, value: (r) => r.assignedRole },
  { key: "status", label: "Status", group: "Serving", toggle: null, value: (r) => r.status },
  { key: "signedUpAt", label: "Signed Up At", group: "Serving", toggle: null, value: (r) => formatManilaDateTime(r.signedUpAt) },
  { key: "notes", label: "Notes", group: "Serving", toggle: null, value: (r) => r.notes },
  { key: "leaderNotes", label: "Leader Notes", group: "Serving", toggle: null, optional: true, value: (r) => r.leaderNotes },

  // ── Modules ──
  { key: "bus", label: "Bus", group: "Embarkation", module: "Embarkation", toggle: null, value: (r) => r.bus },
  { key: "busDirection", label: "Bus Direction", group: "Embarkation", module: "Embarkation", toggle: null, value: (r) => r.busDirection },
]

export function eventVolunteerColumns(): ColumnDef[] {
  return sortByGroup([...COLUMNS], VOLUNTEER_EXPORT_GROUPS)
}

export function buildEventVolunteerColumns(
  modules: EventModuleType[],
  rows: EventVolunteerExportRow[],
): VolunteerExportColumnState[] {
  return buildExportColumns(eventVolunteerColumns(), rows, (column) =>
    column.module ? modules.includes(column.module) : false,
  )
}

/** Table for the chosen columns, in registry order. */
export function buildEventVolunteersTable(
  rows: EventVolunteerExportRow[],
  selectedKeys: string[],
): { headers: string[]; cells: CSVCell[][] } {
  return buildExportTable(eventVolunteerColumns(), rows, selectedKeys)
}
