import type { Prisma } from "@/app/generated/prisma/client"
import { allTokensMatch } from "@/lib/search/name-search"
import { formatSchedule, formatTime } from "@/lib/format/schedule"

export const DGROUP_FILTER_KEYS = [
  "search", "lifeStageId", "genderFocus", "meetingFormat", "status", "groupType",
  "day", "timeOfDay", "city", "language", "leader", "parent",
] as const
export type DGroupFilters = Record<(typeof DGROUP_FILTER_KEYS)[number], string>

const choices = {
  genderFocus: ["Male", "Female", "Mixed"],
  meetingFormat: ["Online", "Hybrid", "InPerson"],
  status: ["Active", "Pending", "Inactive"],
  groupType: ["Regular", "Couples"],
  day: ["0", "1", "2", "3", "4", "5", "6", "missing"],
  timeOfDay: ["morning", "afternoon", "evening", "missing"],
} as const

export function parseDGroupFilters(params: Record<string, string | string[] | undefined>): DGroupFilters {
  const filters = Object.fromEntries(DGROUP_FILTER_KEYS.map((key) => [key, typeof params[key] === "string" ? params[key].trim() : ""])) as DGroupFilters
  for (const [key, values] of Object.entries(choices)) {
    if (!(values as readonly string[]).includes(filters[key as keyof DGroupFilters])) filters[key as keyof DGroupFilters] = ""
  }
  return filters
}

export function dGroupFilterWhere(filters: DGroupFilters): Prisma.SmallGroupWhereInput {
  const conditions: Prisma.SmallGroupWhereInput[] = []
  const search = allTokensMatch<Prisma.SmallGroupWhereInput>(filters.search, (token) => [
    { name: { contains: token, mode: "insensitive" } },
    { leader: { firstName: { contains: token, mode: "insensitive" } } },
    { leader: { lastName: { contains: token, mode: "insensitive" } } },
  ])
  if (search) conditions.push(search)
  if (filters.lifeStageId) conditions.push(filters.lifeStageId === "missing" ? { lifeStages: { none: {} } } : { lifeStages: { some: { id: filters.lifeStageId } } })
  if (filters.genderFocus) conditions.push({ genderFocus: filters.genderFocus as "Male" | "Female" | "Mixed" })
  if (filters.meetingFormat) conditions.push({ meetingFormat: filters.meetingFormat as "Online" | "Hybrid" | "InPerson" })
  if (filters.status) conditions.push({ status: filters.status as "Active" | "Pending" | "Inactive" })
  if (filters.groupType) conditions.push({ groupType: filters.groupType as "Regular" | "Couples" })
  if (filters.day) conditions.push(filters.day === "missing" ? { scheduleDayOfWeek: null } : { scheduleDayOfWeek: Number(filters.day) })
  if (filters.timeOfDay === "missing") conditions.push({ OR: [{ scheduleTimeStart: null }, { scheduleTimeStart: "" }] })
  if (filters.timeOfDay === "morning") conditions.push({ scheduleTimeStart: { gte: "00:00", lt: "12:00" } })
  if (filters.timeOfDay === "afternoon") conditions.push({ scheduleTimeStart: { gte: "12:00", lt: "18:00" } })
  if (filters.timeOfDay === "evening") conditions.push({ scheduleTimeStart: { gte: "18:00", lt: "24:00" } })
  if (filters.city) conditions.push({ locationCity: { equals: filters.city, mode: "insensitive" } })
  if (filters.language) conditions.push({ language: { has: filters.language } })
  if (filters.leader) conditions.push({ leaderId: filters.leader })
  if (filters.parent === "missing") conditions.push({ parentGroupId: null, OR: [{ parentSatellite: null }, { parentSatellite: "" }] })
  else if (filters.parent === "satellite") conditions.push({ parentGroupId: null, parentSatellite: { not: null }, NOT: { parentSatellite: "" } })
  else if (filters.parent) conditions.push({ parentGroupId: filters.parent })
  return { AND: conditions }
}

export function dGroupScheduleLabel(group: { scheduleDayOfWeek: number | null; scheduleTimeStart: string | null; scheduleTimeEnd: string | null }): string {
  if (group.scheduleDayOfWeek !== null) return formatSchedule(group.scheduleDayOfWeek, group.scheduleTimeStart, group.scheduleTimeEnd)
  const start = formatTime(group.scheduleTimeStart)
  if (!start) return "Not set"
  const end = formatTime(group.scheduleTimeEnd)
  return `Day not set · ${end ? `${start} – ${end}` : start}`
}
