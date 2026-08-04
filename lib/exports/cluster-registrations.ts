import type { CSVCell } from "@/lib/csv-export"
import type { EventFormConfigData, FormToggleKey } from "@/lib/forms/context-config"

/**
 * Column model for the Event Cluster registrations export.
 *
 * Pure and framework-free: the server uses it to work out which columns a
 * cluster's forms actually gather, the client uses the same registry to render
 * the column picker and build the CSV. No Prisma, no Blob — importable by both.
 *
 * Two ideas carried over from `lib/forms/registration-responses.ts`, because an
 * export that disagrees with the registrant detail page would be worse than no
 * export at all:
 *
 * 1. **Union across forms.** We don't record which surface someone came through,
 *    so a field counts as gathered if ANY of the cluster's forms (each event's
 *    Register / Walk-in / Check-in, plus the cluster's shared form) collects it.
 * 2. **A value is never hidden.** A field whose toggle has since been switched
 *    off still exports when answers exist — it is simply flagged as no longer
 *    asked, so an admin can tell "nobody answered" from "we stopped asking".
 */

/** One registration record — a person on one of the cluster's events. */
export type ClusterRegistrationExportRow = {
  // Registration record (core — always available)
  eventName: string
  registeredAt: string // ISO datetime
  viaSharedForm: boolean
  checkedIn: boolean
  checkedInAt: string | null // ISO datetime, null when they never checked in
  firstName: string
  lastName: string
  email: string | null
  mobile: string
  type: "Member" | "Guest"

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
}

/** Picker groups, named after the steps of the form they come from. */
export const CLUSTER_EXPORT_GROUPS = [
  "Registration record",
  "Personal Information",
  "DGroup Info",
  "Breakout Group",
  "Your Household",
  "Dietary Preferences",
  "Payment",
] as const

export type ClusterExportGroup = (typeof CLUSTER_EXPORT_GROUPS)[number]

type ColumnDef = {
  key: string
  label: string
  group: ClusterExportGroup
  /** The form toggle that gathers this, or null for the always-collected core. */
  toggle: FormToggleKey | null
  value: (row: ClusterRegistrationExportRow) => CSVCell
}

function formatManilaDateTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  // en-CA gives yyyy-mm-dd, which sorts correctly in a spreadsheet.
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
  const time = d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
  return `${date} ${time}`
}

const yesNo = (v: boolean): string => (v ? "Yes" : "No")

/**
 * Every column, in export order. Ordering and grouping mirror `REGISTER_LAYOUT`
 * in `lib/forms/context-config.ts` — the picker should read like the form the
 * admin configured, not like the database.
 */
export const CLUSTER_EXPORT_COLUMNS: readonly ColumnDef[] = [
  // ── Registration record ──
  { key: "eventName", label: "Event", group: "Registration record", toggle: null, value: (r) => r.eventName },
  { key: "registeredAt", label: "Registered At", group: "Registration record", toggle: null, value: (r) => formatManilaDateTime(r.registeredAt) },
  { key: "viaSharedForm", label: "Via Shared Form", group: "Registration record", toggle: null, value: (r) => yesNo(r.viaSharedForm) },
  { key: "checkedIn", label: "Checked In", group: "Registration record", toggle: null, value: (r) => yesNo(r.checkedIn) },
  { key: "checkedInAt", label: "Checked In At", group: "Registration record", toggle: null, value: (r) => formatManilaDateTime(r.checkedInAt) },

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

  // ── Remaining sections ──
  { key: "breakoutGroup", label: "Breakout Group", group: "Breakout Group", toggle: "sectionBreakout", value: (r) => r.breakoutGroup },
  { key: "household", label: "Household", group: "Your Household", toggle: "sectionFamily", value: (r) => r.household },
  { key: "dietary", label: "Dietary Preference", group: "Dietary Preferences", toggle: "sectionDietary", value: (r) => r.dietary },
  { key: "isPaid", label: "Paid", group: "Payment", toggle: "sectionPayment", value: (r) => yesNo(r.isPaid) },
  { key: "paymentReference", label: "Payment Reference", group: "Payment", toggle: "sectionPayment", value: (r) => r.paymentReference },
]

export type ClusterExportColumnKey = (typeof CLUSTER_EXPORT_COLUMNS)[number]["key"]

/** A column offered in the picker, with why it is on offer. */
export type ClusterExportColumnState = {
  key: string
  label: string
  group: ClusterExportGroup
  /** Always exportable — identity and registration metadata, not a form toggle. */
  core: boolean
  /** One of the cluster's forms currently asks for this. */
  collected: boolean
  /** At least one registration in the cluster has an answer. */
  hasData: boolean
}

function isEmpty(cell: CSVCell): boolean {
  return cell === null || cell === undefined || String(cell).trim() === ""
}

/**
 * Which columns to offer for a cluster: the core, plus every form-gathered
 * column that is either still asked or already has answers. A field that was
 * never asked and holds nothing is left out entirely — an all-blank column is
 * noise, not information.
 *
 * `isPaid` needs its own data test. It renders as "Yes"/"No", never blank, so
 * the emptiness check would call it populated for every cluster and offer a
 * payment column to events that don't charge. Someone actually being marked
 * paid is the real signal.
 */
export function buildClusterExportColumns(
  config: EventFormConfigData,
  rows: ClusterRegistrationExportRow[],
): ClusterExportColumnState[] {
  return CLUSTER_EXPORT_COLUMNS.flatMap((column): ClusterExportColumnState[] => {
    const collected = column.toggle ? config[column.toggle] === true : false
    const hasData =
      column.key === "isPaid"
        ? rows.some((r) => r.isPaid)
        : rows.some((r) => !isEmpty(column.value(r)))
    if (!column.toggle) {
      return [{ key: column.key, label: column.label, group: column.group, core: true, collected: true, hasData }]
    }
    if (!collected && !hasData) return []
    return [{ key: column.key, label: column.label, group: column.group, core: false, collected, hasData }]
  })
}

/**
 * The picker's starting state: everything on offer. A column only reaches the
 * picker because it is core, still asked, or holds answers — so the honest
 * default is "export it all" and let the admin narrow.
 */
export function defaultSelectedColumns(columns: ClusterExportColumnState[]): string[] {
  return columns.map((c) => c.key)
}

/**
 * Table for the chosen columns. Order always follows the registry, never the
 * order the admin happened to tick the boxes in.
 */
export function buildClusterRegistrationsTable(
  rows: ClusterRegistrationExportRow[],
  selectedKeys: string[],
): { headers: string[]; cells: CSVCell[][] } {
  const selected = new Set(selectedKeys)
  const columns = CLUSTER_EXPORT_COLUMNS.filter((c) => selected.has(c.key))
  return {
    headers: columns.map((c) => c.label),
    cells: rows.map((row) => columns.map((c) => c.value(row))),
  }
}
