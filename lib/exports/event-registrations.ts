import type { CSVCell } from "@/lib/csv-export"
import type { EventFormConfigData } from "@/lib/forms/context-config"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"
import {
  buildExportColumns,
  buildExportTable,
  formatManilaDateTime,
  sortByGroup,
  yesNo,
  type ExportColumnDef,
  type ExportColumnState,
} from "./columns"

/**
 * Column model for a single event's registrations export.
 *
 * The cluster registry (`./cluster-registrations.ts`) is the sibling of this one
 * and the two deliberately agree on labels, groups and value formatting — an
 * admin who exports a day and then one of its events should get the same
 * spreadsheet shape, not two dialects.
 *
 * Two things a cluster has no equivalent for:
 *
 * 1. **The registration record depends on the event's type.** A OneTime event
 *    checks people in once (`attendedAt`); a MultiDay or Recurring one checks
 *    them in per session. Offering "Attended" on a Recurring event would answer
 *    the wrong question, so `eventRegistrationColumns` takes the type.
 * 2. **Add-on modules gather data too.** Baptism opt-ins and bus assignments are
 *    not form answers, but they are per-registrant facts an admin exports for
 *    exactly the same reasons. They are gated on the module being enabled,
 *    following the same "a value is never hidden" rule as the form toggles: a
 *    module switched off that still holds records keeps its column.
 */

export type EventRegistrationExportRow = {
  registrantId: string

  // Registration record (core — always available)
  firstName: string
  lastName: string
  email: string | null
  mobile: string
  type: "Member" | "Guest"
  registeredAt: string // ISO datetime
  /** OneTime check-in; null on session events, which use the two fields below. */
  attendedAt: string | null
  /** Sessions this person checked in to (MultiDay / Recurring). */
  sessionsAttended: number
  /** Those sessions' dates, `yyyy-mm-dd` joined with "; ". Null when none. */
  sessionDates: string | null

  // Form-gathered answers — all display-formatted server-side, null when unanswered
  nickname: string | null
  lifeStage: string | null
  birthDate: string | null
  ageRange: string | null
  gender: string | null
  language: string | null
  meetingPreference: string | null
  schedule: string | null
  workCity: string | null
  claimedSmallGroup: string | null
  breakoutGroup: string | null
  household: string | null
  dietary: string | null
  isPaid: boolean
  paymentReference: string | null

  // Module-gathered facts
  baptismOptIn: boolean
  bus: string | null
  busDirection: string | null
}

/**
 * Picker groups, named after the steps of the form they come from. Who the
 * person is comes first, then their registration record, then the answers — a
 * row should read left-to-right the way the registrants table does.
 */
export const EVENT_EXPORT_GROUPS = [
  "Personal Information",
  "Registration record",
  "DGroup Info",
  "Breakout Group",
  "Your Household",
  "Dietary Preferences",
  "Payment",
  "Baptism",
  "Embarkation",
] as const

export type EventExportGroup = (typeof EVENT_EXPORT_GROUPS)[number]

type ColumnDef = ExportColumnDef<EventRegistrationExportRow, EventExportGroup>

export type EventExportColumnState = ExportColumnState<EventExportGroup>

/** Columns that don't depend on the event's type, in export order. */
const STATIC_COLUMNS: readonly ColumnDef[] = [
  // ── Personal Information ──
  { key: "firstName", label: "First Name", group: "Personal Information", toggle: null, value: (r) => r.firstName },
  { key: "lastName", label: "Last Name", group: "Personal Information", toggle: null, value: (r) => r.lastName },
  { key: "mobile", label: "Mobile", group: "Personal Information", toggle: null, value: (r) => r.mobile },
  { key: "email", label: "Email", group: "Personal Information", toggle: null, value: (r) => r.email },
  { key: "type", label: "Type", group: "Personal Information", toggle: null, value: (r) => r.type },
  { key: "nickname", label: "Nickname", group: "Personal Information", toggle: "fieldNickname", value: (r) => r.nickname },
  { key: "lifeStage", label: "Life Stage", group: "Personal Information", toggle: "fieldLifeStage", value: (r) => r.lifeStage },
  { key: "birthDate", label: "Birth Month + Year", group: "Personal Information", toggle: "fieldBirthDate", value: (r) => r.birthDate },
  { key: "ageRange", label: "Age Range", group: "Personal Information", toggle: "fieldAgeRange", value: (r) => r.ageRange },
  { key: "gender", label: "Gender", group: "Personal Information", toggle: "fieldGender", value: (r) => r.gender },

  // ── DGroup Info ──
  { key: "language", label: "Language", group: "DGroup Info", toggle: "fieldLanguage", value: (r) => r.language },
  { key: "meetingPreference", label: "Meeting Preference", group: "DGroup Info", toggle: "fieldMeetingPreference", value: (r) => r.meetingPreference },
  { key: "schedule", label: "Schedule", group: "DGroup Info", toggle: "fieldSchedule", value: (r) => r.schedule },
  { key: "workCity", label: "Work City", group: "DGroup Info", toggle: "fieldWorkCity", value: (r) => r.workCity },
  { key: "claimedSmallGroup", label: "DGroup", group: "DGroup Info", toggle: "sectionSmallGroup", value: (r) => r.claimedSmallGroup },

  // ── Remaining form sections ──
  { key: "breakoutGroup", label: "Breakout Group", group: "Breakout Group", toggle: "sectionBreakout", value: (r) => r.breakoutGroup },
  { key: "household", label: "Household", group: "Your Household", toggle: "sectionFamily", value: (r) => r.household },
  { key: "dietary", label: "Dietary Preference", group: "Dietary Preferences", toggle: "sectionDietary", value: (r) => r.dietary },
  // "Yes"/"No" is never blank, so the default emptiness test would offer a
  // payment column to every event. Someone actually paying is the real signal.
  { key: "isPaid", label: "Paid", group: "Payment", toggle: "sectionPayment", hasData: (rows) => rows.some((r) => r.isPaid), value: (r) => yesNo(r.isPaid) },
  { key: "paymentReference", label: "Payment Reference", group: "Payment", toggle: "sectionPayment", value: (r) => r.paymentReference },

  // ── Modules ──
  { key: "baptismOptIn", label: "Baptism Opt-in", group: "Baptism", module: "Baptism", toggle: null, hasData: (rows) => rows.some((r) => r.baptismOptIn), value: (r) => yesNo(r.baptismOptIn) },
  { key: "bus", label: "Bus", group: "Embarkation", module: "Embarkation", toggle: null, value: (r) => r.bus },
  { key: "busDirection", label: "Bus Direction", group: "Embarkation", module: "Embarkation", toggle: null, value: (r) => r.busDirection },
]

/**
 * The registration-record columns for an event's type.
 *
 * OneTime: one arrival, so "Attended" and when. Session events: the count and
 * the dates, which is what an admin filters and totals on. A per-session column
 * grid isn't offered here — the Sessions screen exports that in full, one row
 * per attendee per session, which is the shape that question wants.
 */
function recordColumns(eventType: EventType): ColumnDef[] {
  const registeredAt: ColumnDef = {
    key: "registeredAt",
    label: "Registered At",
    group: "Registration record",
    toggle: null,
    value: (r) => formatManilaDateTime(r.registeredAt),
  }
  if (eventType === "OneTime") {
    return [
      registeredAt,
      {
        key: "attended",
        label: "Attended",
        group: "Registration record",
        toggle: null,
        value: (r) => yesNo(r.attendedAt !== null),
      },
      {
        key: "attendedAt",
        label: "Attended At",
        group: "Registration record",
        toggle: null,
        value: (r) => formatManilaDateTime(r.attendedAt),
      },
    ]
  }
  return [
    registeredAt,
    {
      key: "sessionsAttended",
      label: "Sessions Attended",
      group: "Registration record",
      toggle: null,
      value: (r) => r.sessionsAttended,
    },
    {
      key: "sessionDates",
      label: "Sessions Attended (dates)",
      group: "Registration record",
      toggle: null,
      value: (r) => r.sessionDates,
    },
  ]
}

/** The real registry for an event: static columns plus its type's record columns. */
export function eventRegistrationColumns(eventType: EventType): ColumnDef[] {
  return sortByGroup([...STATIC_COLUMNS, ...recordColumns(eventType)], EVENT_EXPORT_GROUPS)
}

/**
 * Which columns to offer for an event: form toggles come from the union of the
 * event's three form contexts, module columns from what's enabled. Both keep
 * their column when the gate is off but records exist.
 */
export function buildEventRegistrationColumns(
  config: EventFormConfigData,
  modules: EventModuleType[],
  rows: EventRegistrationExportRow[],
  eventType: EventType,
): EventExportColumnState[] {
  return buildExportColumns(eventRegistrationColumns(eventType), rows, (column) => {
    if (column.module) return modules.includes(column.module)
    return column.toggle ? config[column.toggle] === true : false
  })
}

/** Table for the chosen columns, in registry order. */
export function buildEventRegistrationsTable(
  rows: EventRegistrationExportRow[],
  selectedKeys: string[],
  eventType: EventType,
): { headers: string[]; cells: CSVCell[][] } {
  return buildExportTable(eventRegistrationColumns(eventType), rows, selectedKeys)
}
