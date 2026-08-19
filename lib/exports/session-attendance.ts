import type { CSVCell } from "@/lib/csv-export"
import {
  buildExportColumns,
  buildExportTable,
  sortByGroup,
  type ExportColumnDef,
  type ExportColumnState,
} from "./columns"

/**
 * Column model for the session attendance export — one row per attendee per
 * session, registrants and volunteers alike.
 *
 * Unlike the registration exports there is no form config behind an attendance
 * sheet: a check-in gathers no answers, it records that somebody arrived. So
 * nothing here is toggle-gated — the columns that aren't always present are
 * `optional`, offered when populated and absent otherwise, which is what keeps
 * `Series` off an event that runs no series without ever claiming the question
 * was switched off. `isGathered` is never consulted.
 */

export type SessionAttendanceExportRow = {
  sessionDate: string // ISO yyyy-mm-dd
  seriesTitle: string | null
  firstName: string
  lastName: string
  nickname: string | null
  mobile: string
  email: string | null
  type: "Member" | "Guest" | "Volunteer"
  checkedInAt: string // ISO datetime
}

export const SESSION_ATTENDANCE_GROUPS = [
  "Session",
  "Personal Information",
  "Check-in",
] as const

export type SessionAttendanceGroup = (typeof SESSION_ATTENDANCE_GROUPS)[number]

type ColumnDef = ExportColumnDef<SessionAttendanceExportRow, SessionAttendanceGroup>

export type SessionAttendanceColumnState = ExportColumnState<SessionAttendanceGroup>

/**
 * Time of day only — the date is its own column, so repeating it in every
 * check-in cell would be noise. Matches what the sessions screen displays.
 */
function formatCheckInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
}

const COLUMNS: readonly ColumnDef[] = [
  { key: "sessionDate", label: "Session Date", group: "Session", toggle: null, value: (r) => r.sessionDate },
  // An event with no series has nothing to put here, and a blank column on every
  // row of a non-series event is noise.
  { key: "seriesTitle", label: "Series", group: "Session", toggle: null, optional: true, value: (r) => r.seriesTitle },

  { key: "firstName", label: "First Name", group: "Personal Information", toggle: null, value: (r) => r.firstName },
  { key: "lastName", label: "Last Name", group: "Personal Information", toggle: null, value: (r) => r.lastName },
  { key: "nickname", label: "Nickname", group: "Personal Information", toggle: null, optional: true, value: (r) => r.nickname },
  { key: "mobile", label: "Mobile", group: "Personal Information", toggle: null, value: (r) => r.mobile },
  { key: "email", label: "Email", group: "Personal Information", toggle: null, optional: true, value: (r) => r.email },
  { key: "type", label: "Type", group: "Personal Information", toggle: null, value: (r) => r.type },

  { key: "checkedInAt", label: "Checked In", group: "Check-in", toggle: null, value: (r) => formatCheckInTime(r.checkedInAt) },
]

export function sessionAttendanceColumns(): ColumnDef[] {
  return sortByGroup([...COLUMNS], SESSION_ATTENDANCE_GROUPS)
}

/**
 * Which columns to offer. Nothing here is form-gathered, so the offer is driven
 * purely by whether any row holds a value — `isGathered` always says no, and a
 * gated column survives only on `hasData`.
 */
export function buildSessionAttendanceColumns(
  rows: SessionAttendanceExportRow[],
): SessionAttendanceColumnState[] {
  return buildExportColumns(sessionAttendanceColumns(), rows, () => false)
}

/** Table for the chosen columns, in registry order. */
export function buildSessionAttendanceTable(
  rows: SessionAttendanceExportRow[],
  selectedKeys: string[],
): { headers: string[]; cells: CSVCell[][] } {
  return buildExportTable(sessionAttendanceColumns(), rows, selectedKeys)
}
