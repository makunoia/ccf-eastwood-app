"use client"

import { downloadCSV, formatDayOfWeek, type CSVCell } from "./csv-export"

// Row shapes — kept minimal and aligned to import field labels so a round-trip
// (export → re-import) auto-maps without manual column matching.

export type MemberExportRow = {
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  address: string | null
  dateJoined: string  // ISO yyyy-mm-dd
  smallGroupName: string | null
  lifeStage: string | null
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  notes: string | null
}

const MEMBER_HEADERS = [
  "First Name", "Last Name", "Nickname", "Date Joined", "Email", "Phone", "Address",
  "Small Group", "Life Stage", "Gender", "Language",
  "Birth Month", "Birth Year", "Work City", "Work Industry",
  "Meeting Preference", "Notes",
]

function memberToCells(m: MemberExportRow): CSVCell[] {
  return [
    m.firstName, m.lastName, m.nickname, m.dateJoined, m.email, m.phone, m.address,
    m.smallGroupName, m.lifeStage, m.gender, m.language.join("; "),
    m.birthMonth, m.birthYear, m.workCity, m.workIndustry,
    m.meetingPreference, m.notes,
  ]
}

export function exportMembersCSV(rows: MemberExportRow[]): void {
  downloadCSV(
    `members-${new Date().toISOString().split("T")[0]}.csv`,
    MEMBER_HEADERS,
    rows.map(memberToCells),
  )
}

// ── Guest ─────────────────────────────────────────────────────────────────────

export type GuestExportRow = {
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  lifeStage: string | null
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  notes: string | null
  dateAdded: string  // ISO yyyy-mm-dd
}

const GUEST_HEADERS = [
  "First Name", "Last Name", "Nickname", "Email", "Phone", "Date Added",
  "Life Stage", "Gender", "Language",
  "Birth Month", "Birth Year", "Work City", "Work Industry",
  "Meeting Preference", "Notes",
]

function guestToCells(g: GuestExportRow): CSVCell[] {
  return [
    g.firstName, g.lastName, g.nickname, g.email, g.phone, g.dateAdded,
    g.lifeStage, g.gender, g.language.join("; "),
    g.birthMonth, g.birthYear, g.workCity, g.workIndustry,
    g.meetingPreference, g.notes,
  ]
}

export function exportGuestsCSV(rows: GuestExportRow[]): void {
  downloadCSV(
    `guests-${new Date().toISOString().split("T")[0]}.csv`,
    GUEST_HEADERS,
    rows.map(guestToCells),
  )
}

// ── Small Group ───────────────────────────────────────────────────────────────

export type SmallGroupExportRow = {
  name: string
  status: string
  leaderFirstName: string
  leaderLastName: string
  leaderEmail: string | null
  leaderMobile: string | null
  parentGroupName: string | null
  lifeStage: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  memberLimit: number | null
  memberCount: number
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
}

const SMALL_GROUP_HEADERS = [
  "Group Name", "Status",
  "Leader First Name", "Leader Last Name", "Leader Mobile", "Leader Email",
  "Parent Group", "Life Stage", "Gender Focus", "Language",
  "Min Age", "Max Age", "Meeting Format", "Location City",
  "Member Limit", "Current Members",
  "Meeting Day", "Meeting Time Start", "Meeting Time End",
]

function smallGroupToCells(g: SmallGroupExportRow): CSVCell[] {
  return [
    g.name, g.status,
    g.leaderFirstName, g.leaderLastName, g.leaderMobile, g.leaderEmail,
    g.parentGroupName, g.lifeStage, g.genderFocus, g.language.join("; "),
    g.ageRangeMin, g.ageRangeMax, g.meetingFormat, g.locationCity,
    g.memberLimit, g.memberCount,
    formatDayOfWeek(g.scheduleDayOfWeek), g.scheduleTimeStart, g.scheduleTimeEnd,
  ]
}

export function exportSmallGroupsCSV(rows: SmallGroupExportRow[]): void {
  downloadCSV(
    `small-groups-${new Date().toISOString().split("T")[0]}.csv`,
    SMALL_GROUP_HEADERS,
    rows.map(smallGroupToCells),
  )
}

// ── Volunteer ─────────────────────────────────────────────────────────────────

export type VolunteerExportRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  committeeName: string
  preferredRole: string
  assignedRole: string | null
  status: string
  notes: string | null
}

// "Role Name" aligns to the import's roleName (= preferred role) so an
// export → re-import round-trips; "Assigned Role" is extra context.
const VOLUNTEER_HEADERS = [
  "First Name", "Last Name", "Email", "Phone",
  "Committee Name", "Role Name", "Assigned Role", "Status", "Notes",
]

function volunteerToCells(v: VolunteerExportRow): CSVCell[] {
  return [
    v.firstName, v.lastName, v.email, v.phone,
    v.committeeName, v.preferredRole, v.assignedRole, v.status, v.notes,
  ]
}

export function exportVolunteersCSV(rows: VolunteerExportRow[]): void {
  downloadCSV(
    `volunteers-${new Date().toISOString().split("T")[0]}.csv`,
    VOLUNTEER_HEADERS,
    rows.map(volunteerToCells),
  )
}

// ── Event Sessions ────────────────────────────────────────────────────────────

export type SessionSummaryExportRow = {
  date: string // ISO datetime
  seriesTitle: string | null
  isStandalone: boolean
  attendeeCount: number
}

export function buildSessionsSummaryTable(
  rows: SessionSummaryExportRow[],
  includeSeries: boolean,
): { headers: string[]; cells: CSVCell[][] } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  if (!includeSeries) {
    return {
      headers: ["Date", "Attendance"],
      cells: sorted.map((r) => [r.date.split("T")[0], r.attendeeCount]),
    }
  }
  return {
    headers: ["Date", "Series", "Stand-alone", "Attendance"],
    cells: sorted.map((r) => [
      r.date.split("T")[0],
      r.seriesTitle,
      r.isStandalone ? "Yes" : "No",
      r.attendeeCount,
    ]),
  }
}

export function exportSessionsSummaryCSV(
  filename: string,
  rows: SessionSummaryExportRow[],
  includeSeries: boolean,
): void {
  const { headers, cells } = buildSessionsSummaryTable(rows, includeSeries)
  downloadCSV(filename, headers, cells)
}

export type SessionAttendanceExportRow = {
  sessionDate: string // ISO yyyy-mm-dd
  seriesTitle: string | null
  firstName: string
  lastName: string
  mobile: string
  type: "Member" | "Guest" | "Volunteer"
  checkedInAt: string // ISO datetime
}

function formatCheckInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
}

export function buildSessionAttendanceTable(
  rows: SessionAttendanceExportRow[],
  includeSeries: boolean,
): { headers: string[]; cells: CSVCell[][] } {
  const headers = [
    "Session Date",
    ...(includeSeries ? ["Series"] : []),
    "First Name",
    "Last Name",
    "Mobile",
    "Type",
    "Checked In",
  ]
  const cells = rows.map((r) => [
    r.sessionDate,
    ...(includeSeries ? [r.seriesTitle] : []),
    r.firstName,
    r.lastName,
    r.mobile,
    r.type,
    formatCheckInTime(r.checkedInAt),
  ])
  return { headers, cells }
}

export function exportSessionAttendanceCSV(
  filename: string,
  rows: SessionAttendanceExportRow[],
  includeSeries: boolean,
): void {
  const { headers, cells } = buildSessionAttendanceTable(rows, includeSeries)
  downloadCSV(filename, headers, cells)
}
