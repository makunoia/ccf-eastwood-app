import type { CSVCell } from "@/lib/csv-export"
import type { EventFormConfigData } from "@/lib/forms/context-config"
import {
  buildExportColumns,
  buildExportTable,
  defaultSelectedColumns,
  formatManilaDateTime,
  sortByGroup,
  yesNo,
  type ExportColumnDef,
  type ExportColumnState,
} from "./columns"

/**
 * Column model for the Event Cluster registrations export.
 *
 * The generic column machinery lives in `./columns.ts`; this module is the
 * cluster's registry over it — the row shape, the groups, and what "does one of
 * the day's forms ask this?" means for a cluster.
 *
 * **One row per PERSON, not per registration.** A cluster is one day, and a
 * person on three of that day's events is one person — exporting them three
 * times repeats their whole profile (name, mobile, life stage, household…) and
 * makes every count in the spreadsheet wrong. Their events live across the row
 * instead, one column per cluster event, mirroring the roster matrix on the
 * registrants screen the export is launched from.
 *
 * A field counts as gathered if ANY of the cluster's forms (each event's
 * Register / Walk-in / Check-in, plus the cluster's shared form) collects it —
 * see the rules in `./columns.ts`.
 */

/** An event of the cluster, as a column in the export. */
export type ClusterExportEvent = { id: string; name: string }

/**
 * How a person stands on one of the day's events. Absent = not on it at all.
 *
 * `SeriesOnly` is a registration on a Recurring/MultiDay event that carries no
 * evidence for this particular day — they signed up for the series at some other
 * time and neither checked in nor came through the day's link. It is deliberately
 * distinct from a blank: the person IS registered, and an export that blanked
 * them would tell an admin to go add someone the system already holds.
 */
export type ClusterParticipation = "CheckedIn" | "Registered" | "SeriesOnly"

const PARTICIPATION_LABEL: Record<ClusterParticipation, string> = {
  CheckedIn: "Checked in",
  Registered: "Registered",
  SeriesOnly: "On the series",
}

/**
 * Which value survives when one person holds two registrations on the same
 * event: having arrived beats having signed up for the day, which beats merely
 * standing on the series. Mirrors `STANDING_RANK` in `lib/clusters/roster.ts`.
 */
export const PARTICIPATION_RANK: Record<ClusterParticipation, number> = {
  CheckedIn: 2,
  Registered: 1,
  SeriesOnly: 0,
}

/** One person on the cluster's day, with every event they're on folded in. */
export type ClusterRegistrationExportRow = {
  /** Stable identity: member:<id> | guest:<id> | registrant:<id> (anonymous). */
  personKey: string
  /** Per cluster event id — how they stand on it, absent when they aren't on it. */
  perEvent: Record<string, ClusterParticipation | undefined>

  // Registration record (core — always available)
  /** Earliest registration across the day's events. */
  registeredAt: string // ISO datetime
  /** They reached at least one of the day's events through the shared link. */
  viaSharedForm: boolean
  /** They checked in to at least one of the day's events. */
  checkedIn: boolean
  /** Earliest check-in across the day's events; null when they never arrived. */
  checkedInAt: string | null // ISO datetime
  firstName: string
  lastName: string
  email: string | null
  mobile: string
  /**
   * Volunteer wins over Member because it says more: every volunteer is a
   * member, so nothing is lost, while "Member" would hide why they are here.
   */
  type: "Member" | "Guest" | "Volunteer"

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

/**
 * Picker groups, named after the steps of the form they come from — except
 * "Events", which is the day itself. Who the person is comes first, then the
 * events they're on, then the timestamps: a row should read left-to-right the
 * way the registrants table does.
 */
export const CLUSTER_EXPORT_GROUPS = [
  "Personal Information",
  "Events",
  "Registration record",
  "DGroup Info",
  "Breakout Group",
  "Your Household",
  "Dietary Preferences",
  "Payment",
] as const

export type ClusterExportGroup = (typeof CLUSTER_EXPORT_GROUPS)[number]

type ColumnDef = ExportColumnDef<ClusterRegistrationExportRow, ClusterExportGroup>

/** Column key for one of the cluster's events. Namespaced so it can't collide. */
export function eventColumnKey(eventId: string): string {
  return `event:${eventId}`
}

/**
 * Every column that doesn't depend on which events the cluster holds, in export
 * order. Ordering and grouping mirror `REGISTER_LAYOUT` in
 * `lib/forms/context-config.ts` — the picker should read like the form the admin
 * configured, not like the database.
 *
 * Use `clusterExportColumns(events)` to get the real registry: it splices the
 * cluster's per-event columns into the "Events" slot.
 */
export const CLUSTER_EXPORT_COLUMNS: readonly ColumnDef[] = [
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

  // ── Registration record ──
  // Person-level roll-ups of the day: earliest of each, "any" for the flags.
  { key: "registeredAt", label: "First Registered At", group: "Registration record", toggle: null, value: (r) => formatManilaDateTime(r.registeredAt) },
  { key: "viaSharedForm", label: "Via Shared Form", group: "Registration record", toggle: null, value: (r) => yesNo(r.viaSharedForm) },
  { key: "checkedIn", label: "Checked In (any event)", group: "Registration record", toggle: null, value: (r) => yesNo(r.checkedIn) },
  { key: "checkedInAt", label: "First Checked In At", group: "Registration record", toggle: null, value: (r) => formatManilaDateTime(r.checkedInAt) },

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
  // "Yes"/"No" is never blank, so the default emptiness test would call this
  // populated for every cluster and offer a payment column to events that don't
  // charge. Someone actually being marked paid is the real signal.
  { key: "isPaid", label: "Paid", group: "Payment", toggle: "sectionPayment", hasData: (rows) => rows.some((r) => r.isPaid), value: (r) => yesNo(r.isPaid) },
  { key: "paymentReference", label: "Payment Reference", group: "Payment", toggle: "sectionPayment", value: (r) => r.paymentReference },
]

export type ClusterExportColumnKey = (typeof CLUSTER_EXPORT_COLUMNS)[number]["key"]

/**
 * The real registry for a cluster: the static columns plus one column per event
 * the caller may see, valued "Checked in" / "Registered" / blank.
 *
 * The event columns are what a person-per-row export owes the admin — they carry
 * the fact the old duplicate rows carried, in a shape a spreadsheet can filter
 * and total. Grouping puts them between the person and their timestamps; sorting
 * by group is stable, so within a group the declared order is kept.
 */
export function clusterExportColumns(events: ClusterExportEvent[]): ColumnDef[] {
  const eventColumns: ColumnDef[] = events.map((event) => ({
    key: eventColumnKey(event.id),
    label: event.name,
    group: "Events",
    toggle: null,
    value: (row: ClusterRegistrationExportRow) => {
      const participation = row.perEvent[event.id]
      return participation ? PARTICIPATION_LABEL[participation] : ""
    },
  }))
  return sortByGroup([...CLUSTER_EXPORT_COLUMNS, ...eventColumns], CLUSTER_EXPORT_GROUPS)
}

export type ClusterExportColumnState = ExportColumnState<ClusterExportGroup>

/**
 * Which columns to offer for a cluster. A field counts as asked when any of the
 * day's forms collects it — the union is computed upstream by
 * `getClusterFormCoverage`, so all that's left here is the lookup.
 */
export function buildClusterExportColumns(
  config: EventFormConfigData,
  rows: ClusterRegistrationExportRow[],
  events: ClusterExportEvent[] = [],
): ClusterExportColumnState[] {
  return buildExportColumns(clusterExportColumns(events), rows, (column) =>
    column.toggle ? config[column.toggle] === true : false,
  )
}

export { defaultSelectedColumns }

/** Table for the chosen columns, in registry order. */
export function buildClusterRegistrationsTable(
  rows: ClusterRegistrationExportRow[],
  selectedKeys: string[],
  events: ClusterExportEvent[] = [],
): { headers: string[]; cells: CSVCell[][] } {
  return buildExportTable(clusterExportColumns(events), rows, selectedKeys)
}
