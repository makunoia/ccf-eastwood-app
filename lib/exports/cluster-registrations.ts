import type { CSVCell } from "@/lib/csv-export"
import type { EventFormConfigData, FormToggleKey } from "@/lib/forms/context-config"

/**
 * Column model for the Event Cluster registrations export.
 *
 * Pure and framework-free: the server uses it to work out which columns a
 * cluster's forms actually gather, the client uses the same registry to render
 * the column picker and build the CSV. No Prisma, no Blob — importable by both.
 *
 * **One row per person, one column per event.** A cluster is a day made of
 * several events, and the same person routinely sits on more than one of them.
 * Exporting a row per `EventRegistrant` duplicated that person once per event,
 * so a mail merge or a headcount off the CSV double-counted them. Instead each
 * person appears exactly once and the day's events become Yes/No columns, which
 * is also the shape the cluster dashboard and registrants screen already show.
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

/** An event of the cluster, as the export needs it: a column heading. */
export type ClusterExportEvent = {
  id: string
  name: string
}

/** How one person relates to one of the cluster's events. */
export type ClusterEventParticipation = {
  /** They checked in to this event on the cluster's day. */
  checkedIn: boolean
}

/**
 * One registration record — a person on ONE of the cluster's events. This is
 * the raw shape the server resolves; `collapseRegistrationsToPeople` folds it
 * into the person rows that actually get exported.
 */
export type ClusterRegistrationRecord = {
  /** Stable person identity: member:<id> | guest:<id> | registrant:<id>. */
  personKey: string
  eventId: string

  // Registration record (core — always available)
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

/** One person on the cluster's day, with their per-event participation. */
export type ClusterRegistrationExportRow = Omit<ClusterRegistrationRecord, "eventId"> & {
  /** Keyed by event id; a missing entry means they aren't on that event. */
  events: Record<string, ClusterEventParticipation | undefined>
}

/** Picker groups, named after the steps of the form they come from. */
export const CLUSTER_EXPORT_GROUPS = [
  "Personal Information",
  "Events",
  "Event Check-ins",
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
 * The fixed columns, in export order. Ordering and grouping mirror
 * `REGISTER_LAYOUT` in `lib/forms/context-config.ts` — the picker should read
 * like the form the admin configured, not like the database. The cluster's
 * events add their own columns on top; see `clusterExportColumns`.
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
  // Person-level roll-ups: the earliest of their registrations, and whether they
  // turned up anywhere on the day. The per-event detail lives in the two event
  // groups below.
  { key: "registeredAt", label: "First Registered At", group: "Registration record", toggle: null, value: (r) => formatManilaDateTime(r.registeredAt) },
  { key: "viaSharedForm", label: "Via Shared Form", group: "Registration record", toggle: null, value: (r) => yesNo(r.viaSharedForm) },
  { key: "checkedIn", label: "Checked In (Any Event)", group: "Registration record", toggle: null, value: (r) => yesNo(r.checkedIn) },
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

/** Column key for "is this person on this event". */
export const eventColumnKey = (eventId: string): string => `event:${eventId}`
/** Column key for "did this person check in to this event". */
export const eventCheckInColumnKey = (eventId: string): string => `checkin:${eventId}`

/**
 * A Yes/No column per cluster event, in cluster order — the point of the whole
 * export. Registration and check-in are kept apart because they answer
 * different questions: who signed up for what, and who actually turned up.
 */
function eventColumns(events: ClusterExportEvent[]): ColumnDef[] {
  return [
    ...events.map(
      (event): ColumnDef => ({
        key: eventColumnKey(event.id),
        label: event.name,
        group: "Events",
        toggle: null,
        value: (r) => yesNo(r.events[event.id] !== undefined),
      })
    ),
    ...events.map(
      (event): ColumnDef => ({
        key: eventCheckInColumnKey(event.id),
        label: `${event.name} (Checked In)`,
        group: "Event Check-ins",
        toggle: null,
        value: (r) => yesNo(r.events[event.id]?.checkedIn === true),
      })
    ),
  ]
}

/**
 * Every column for a cluster — the fixed registry plus its events — ordered by
 * `CLUSTER_EXPORT_GROUPS`, so the CSV and the picker always agree.
 */
export function clusterExportColumns(events: ClusterExportEvent[]): ColumnDef[] {
  const all = [...CLUSTER_EXPORT_COLUMNS, ...eventColumns(events)]
  return CLUSTER_EXPORT_GROUPS.flatMap((group) => all.filter((c) => c.group === group))
}

/** A column offered in the picker, with why it is on offer. */
export type ClusterExportColumnState = {
  key: string
  label: string
  group: ClusterExportGroup
  /** Always exportable — identity, event participation, registration metadata. */
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
 * Which columns to offer for a cluster: the core (identity, the day's events,
 * registration metadata), plus every form-gathered column that is either still
 * asked or already has answers. A field that was never asked and holds nothing
 * is left out entirely — an all-blank column is noise, not information.
 *
 * Event columns are always offered, even when nobody registered for that event:
 * a column of "No" is the answer to "who came to this one", not an empty column.
 *
 * `isPaid` needs its own data test. It renders as "Yes"/"No", never blank, so
 * the emptiness check would call it populated for every cluster and offer a
 * payment column to events that don't charge. Someone actually being marked
 * paid is the real signal.
 */
export function buildClusterExportColumns(
  config: EventFormConfigData,
  events: ClusterExportEvent[],
  rows: ClusterRegistrationExportRow[],
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
  events: ClusterExportEvent[],
  rows: ClusterRegistrationExportRow[],
  selectedKeys: string[],
): { headers: string[]; cells: CSVCell[][] } {
  const selected = new Set(selectedKeys)
  const columns = clusterExportColumns(events).filter((c) => selected.has(c.key))
  return {
    headers: columns.map((c) => c.label),
    cells: rows.map((row) => columns.map((c) => c.value(row))),
  }
}

/** Earlier of two ISO timestamps, tolerating nulls. */
function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a) <= new Date(b) ? a : b
}

/** First non-empty of two answers — earlier registrations win. */
function firstAnswer(a: string | null, b: string | null): string | null {
  return a !== null && a.trim() !== "" ? a : b
}

/**
 * Union of two semicolon-joined lists, de-duplicated and order-preserving.
 * Used where a value is genuinely per-event and losing one would be wrong:
 * a person can sit in a different breakout on each event, and pay for each.
 */
function mergeList(a: string | null, b: string | null): string | null {
  const parts = [a, b]
    .filter((v): v is string => v !== null && v.trim() !== "")
    .flatMap((v) => v.split(";").map((p) => p.trim()))
    .filter((p) => p !== "")
  return parts.length > 0 ? [...new Set(parts)].join("; ") : null
}

/**
 * Collapse per-event registration records into one row per person.
 *
 * The person's profile answers (name, life stage, gender, …) are the same
 * whichever event they came through, so the first record wins — with a
 * non-empty preference, since a walk-in row can be sparser than a full
 * registration for the same person. Three values are merged instead, because
 * they are genuinely per-event and dropping one would misreport the day:
 *
 *  - `breakoutGroup` and `paymentReference` are unioned into a list
 *  - `isPaid` and `viaSharedForm` are true when true of any registration
 *  - `registeredAt` / `checkedInAt` keep the earliest, `checkedIn` is "anywhere"
 *
 * Records are expected in cluster order (the order the day runs in), so "first
 * wins" means "the earliest event of the day". Output is sorted by last name
 * then first name, matching the roster and the registrants screen.
 */
export function collapseRegistrationsToPeople(
  records: ClusterRegistrationRecord[],
): ClusterRegistrationExportRow[] {
  const byPerson = new Map<string, ClusterRegistrationExportRow>()

  for (const record of records) {
    const { eventId, ...rest } = record
    const participation: ClusterEventParticipation = { checkedIn: record.checkedIn }
    const existing = byPerson.get(record.personKey)

    if (!existing) {
      byPerson.set(record.personKey, { ...rest, events: { [eventId]: participation } })
      continue
    }

    existing.events[eventId] = participation
    existing.registeredAt = earliest(existing.registeredAt, record.registeredAt) ?? existing.registeredAt
    existing.checkedInAt = earliest(existing.checkedInAt, record.checkedInAt)
    existing.checkedIn = existing.checkedIn || record.checkedIn
    existing.viaSharedForm = existing.viaSharedForm || record.viaSharedForm
    existing.isPaid = existing.isPaid || record.isPaid
    existing.paymentReference = mergeList(existing.paymentReference, record.paymentReference)
    existing.breakoutGroup = mergeList(existing.breakoutGroup, record.breakoutGroup)

    existing.firstName = existing.firstName || record.firstName
    existing.lastName = existing.lastName || record.lastName
    existing.mobile = existing.mobile || record.mobile
    existing.email = firstAnswer(existing.email, record.email)
    existing.nickname = firstAnswer(existing.nickname, record.nickname)
    existing.lifeStage = firstAnswer(existing.lifeStage, record.lifeStage)
    existing.birthDate = firstAnswer(existing.birthDate, record.birthDate)
    existing.ageRange = firstAnswer(existing.ageRange, record.ageRange)
    existing.gender = firstAnswer(existing.gender, record.gender)
    existing.language = firstAnswer(existing.language, record.language)
    existing.meetingPreference = firstAnswer(existing.meetingPreference, record.meetingPreference)
    existing.schedule = firstAnswer(existing.schedule, record.schedule)
    existing.workCity = firstAnswer(existing.workCity, record.workCity)
    existing.claimedSmallGroup = firstAnswer(existing.claimedSmallGroup, record.claimedSmallGroup)
    existing.household = firstAnswer(existing.household, record.household)
    existing.dietary = firstAnswer(existing.dietary, record.dietary)
  }

  return [...byPerson.values()].sort((a, b) => {
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" })
  })
}
