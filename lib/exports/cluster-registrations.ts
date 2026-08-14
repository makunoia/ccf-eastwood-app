import type { CSVCell } from "@/lib/csv-export"
import type { EventFormConfigData, FormToggleKey } from "@/lib/forms/context-config"

/**
 * Column model for the Event Cluster registrations export.
 *
 * Pure and framework-free: the server uses it to work out which columns a
 * cluster's forms actually gather, the client uses the same registry to render
 * the column picker and build the CSV. No Prisma, no Blob — importable by both.
 *
 * **One row per PERSON, not per registration.** A cluster is one day, and a
 * person on three of that day's events is one person — exporting them three
 * times repeats their whole profile (name, mobile, life stage, household…) and
 * makes every count in the spreadsheet wrong. Their events live across the row
 * instead, one column per cluster event, mirroring the roster matrix on the
 * registrants screen the export is launched from.
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

type ColumnDef = {
  key: string
  label: string
  group: ClusterExportGroup
  /** The form toggle that gathers this, or null for the always-collected core. */
  toggle: FormToggleKey | null
  value: (row: ClusterRegistrationExportRow) => CSVCell
}

/** Column key for one of the cluster's events. Namespaced so it can't collide. */
export function eventColumnKey(eventId: string): string {
  return `event:${eventId}`
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
  { key: "isPaid", label: "Paid", group: "Payment", toggle: "sectionPayment", value: (r) => yesNo(r.isPaid) },
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
  const order = (group: ClusterExportGroup) => CLUSTER_EXPORT_GROUPS.indexOf(group)
  return [...CLUSTER_EXPORT_COLUMNS, ...eventColumns].sort(
    (a, b) => order(a.group) - order(b.group),
  )
}

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
  events: ClusterExportEvent[] = [],
): ClusterExportColumnState[] {
  return clusterExportColumns(events).flatMap((column): ClusterExportColumnState[] => {
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
  events: ClusterExportEvent[] = [],
): { headers: string[]; cells: CSVCell[][] } {
  const selected = new Set(selectedKeys)
  const columns = clusterExportColumns(events).filter((c) => selected.has(c.key))
  return {
    headers: columns.map((c) => c.label),
    cells: rows.map((row) => columns.map((c) => c.value(row))),
  }
}
