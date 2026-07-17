// Compact, JSON-serializable projections returned by assistant tools.
// Never return raw Prisma rows from a tool: Dates must become ISO strings and
// payloads must stay small — tool outputs are re-sent to the model every turn.

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export function dayLabel(dayOfWeek: number | null | undefined): string | null {
  if (dayOfWeek == null) return null
  return DAY_LABELS[dayOfWeek] ?? null
}

export function isoDate(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

export function fullName(person: {
  firstName: string
  lastName: string
  nickname?: string | null
}): string {
  const nick = person.nickname ? ` "${person.nickname}"` : ""
  return `${person.firstName}${nick} ${person.lastName}`
}

/** Wrapper every list tool returns. */
export type AssistantList<T> = {
  rows: T[]
  totalCount: number
  truncated: boolean
}

export function toAssistantList<T>(rows: T[], totalCount: number): AssistantList<T> {
  return { rows, totalCount, truncated: totalCount > rows.length }
}

// ─── Members ──────────────────────────────────────────────────────────────────

export type AssistantMemberRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  lifeStage: string | null
  smallGroup: string | null
  groupStatus: string | null
  gender: string | null
  dateJoined: string | null
}

type MemberRowSource = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  gender: string | null
  dateJoined: Date
  groupStatus: string | null
  lifeStage: { name: string } | null
  smallGroup: { name: string } | null
}

export function toAssistantMemberRow(m: MemberRowSource): AssistantMemberRow {
  return {
    id: m.id,
    name: fullName(m),
    email: m.email,
    phone: m.phone,
    lifeStage: m.lifeStage?.name ?? null,
    smallGroup: m.smallGroup?.name ?? null,
    groupStatus: m.groupStatus,
    gender: m.gender,
    dateJoined: isoDate(m.dateJoined),
  }
}

// ─── Guests ───────────────────────────────────────────────────────────────────

export type AssistantGuestRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  lifeStage: string | null
  gender: string | null
  claimedSmallGroup: string | null
  promoted: boolean
  createdAt: string | null
}

type GuestRowSource = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  gender: string | null
  memberId: string | null
  createdAt: Date
  lifeStage: { name: string } | null
  claimedSmallGroup: { name: string } | null
}

export function toAssistantGuestRow(g: GuestRowSource): AssistantGuestRow {
  return {
    id: g.id,
    name: fullName(g),
    email: g.email,
    phone: g.phone,
    lifeStage: g.lifeStage?.name ?? null,
    gender: g.gender,
    claimedSmallGroup: g.claimedSmallGroup?.name ?? null,
    promoted: g.memberId !== null,
    createdAt: isoDate(g.createdAt),
  }
}

// ─── Small groups ─────────────────────────────────────────────────────────────

export type AssistantGroupRow = {
  id: string
  name: string
  leader: string | null
  memberCount: number
  memberLimit: number | null
  lifeStages: string[]
  genderFocus: string | null
  groupType: string
  status: string
  schedule: string | null
}

type GroupRowSource = {
  id: string
  name: string
  genderFocus: string | null
  groupType: string
  status: string
  memberLimit: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  leader: { firstName: string; lastName: string; nickname: string | null } | null
  lifeStages: { name: string }[]
  _count: { members: number }
}

export function formatSchedule(
  dayOfWeek: number | null,
  timeStart: string | null
): string | null {
  const day = dayLabel(dayOfWeek)
  if (!day) return null
  return timeStart ? `${day} ${timeStart}` : day
}

export function toAssistantGroupRow(g: GroupRowSource): AssistantGroupRow {
  return {
    id: g.id,
    name: g.name,
    leader: g.leader ? fullName(g.leader) : null,
    memberCount: g._count.members,
    memberLimit: g.memberLimit,
    lifeStages: g.lifeStages.map((ls) => ls.name),
    genderFocus: g.genderFocus,
    groupType: g.groupType,
    status: g.status,
    schedule: formatSchedule(g.scheduleDayOfWeek, g.scheduleTimeStart),
  }
}

// ─── Ministries ───────────────────────────────────────────────────────────────

export type AssistantMinistryRow = {
  id: string
  name: string
  lifeStage: string | null
  description: string | null
  eventCount: number
}

type MinistryRowSource = {
  id: string
  name: string
  description: string | null
  lifeStage: { name: string } | null
  _count: { events: number }
}

export function toAssistantMinistryRow(m: MinistryRowSource): AssistantMinistryRow {
  return {
    id: m.id,
    name: m.name,
    lifeStage: m.lifeStage?.name ?? null,
    description: m.description,
    eventCount: m._count.events,
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type AssistantEventRow = {
  id: string
  name: string
  type: string
  startDate: string | null
  endDate: string | null
  /** Price in pesos (schema stores cents); null = free. */
  price: number | null
  registrantCount: number
}

type EventRowSource = {
  id: string
  name: string
  type: string
  startDate: Date
  endDate: Date
  price: number | null
  _count: { registrants: number }
}

export function toAssistantEventRow(e: EventRowSource): AssistantEventRow {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    startDate: isoDate(e.startDate),
    endDate: isoDate(e.endDate),
    price: e.price === null ? null : e.price / 100,
    registrantCount: e._count.registrants,
  }
}

// ─── Volunteers ───────────────────────────────────────────────────────────────

export type AssistantVolunteerRow = {
  id: string
  memberId: string
  name: string
  event: string
  committee: string
  preferredRole: string
  assignedRole: string | null
  status: string
}

type VolunteerRowSource = {
  id: string
  memberId: string
  status: string
  member: { firstName: string; lastName: string; nickname: string | null }
  event: { name: string }
  committee: { name: string }
  preferredRole: { name: string }
  assignedRole: { name: string } | null
}

export function toAssistantVolunteerRow(v: VolunteerRowSource): AssistantVolunteerRow {
  return {
    id: v.id,
    memberId: v.memberId,
    name: fullName(v.member),
    event: v.event.name,
    committee: v.committee.name,
    preferredRole: v.preferredRole.name,
    assignedRole: v.assignedRole?.name ?? null,
    status: v.status,
  }
}

// ─── Event registrants ────────────────────────────────────────────────────────

export type AssistantRegistrantRow = {
  id: string
  name: string
  mobileNumber: string | null
  kind: "member" | "guest" | "walk-in"
  isPaid: boolean
  paymentReference: string | null
  attended: boolean
}

type RegistrantRowSource = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  isPaid: boolean
  paymentReference: string | null
  attendedAt: Date | null
  member: {
    firstName: string
    lastName: string
    nickname: string | null
    phone: string | null
  } | null
  guest: {
    firstName: string
    lastName: string
    nickname: string | null
    phone: string | null
  } | null
}

export function toAssistantRegistrantRow(r: RegistrantRowSource): AssistantRegistrantRow {
  const person = r.member ?? r.guest
  return {
    id: r.id,
    name: person
      ? fullName(person)
      : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown",
    mobileNumber: person?.phone ?? r.mobileNumber,
    kind: r.memberId ? "member" : r.guestId ? "guest" : "walk-in",
    isPaid: r.isPaid,
    paymentReference: r.paymentReference,
    attended: r.attendedAt !== null,
  }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export type AssistantMatchRow = {
  groupId: string
  groupName: string
  /** 0–1 compatibility score. */
  totalScore: number
  onCooldown: boolean
  /** Per-parameter scores 0–1, keyed by parameter name. */
  breakdown: Record<string, number>
}

type MatchResultSource = {
  groupId: string
  groupName: string
  totalScore: number
  breakdown: Record<string, number>
  onCooldown?: boolean
}

/** Drops the bulky candidateProfile from engine results — token economy. */
export function toAssistantMatchRow(m: MatchResultSource): AssistantMatchRow {
  return {
    groupId: m.groupId,
    groupName: m.groupName,
    totalScore: Math.round(m.totalScore * 100) / 100,
    onCooldown: m.onCooldown ?? false,
    breakdown: Object.fromEntries(
      Object.entries(m.breakdown).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
  }
}
