import { db } from "@/lib/db"

/**
 * The joinable DGroups of Eastwood, grouped by the member who leads them.
 *
 * Both halves of the /me portal ask the same question — "who is your leader?" —
 * before "which of their groups?", so the shape is built once here rather than
 * twice in the page. A group is only reachable through its leader, so leaderless
 * rows are dropped.
 */
export type LeaderOptionGroup = {
  id: string
  name: string
  groupType: string
  meetingFormat: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
}

export type LeaderOption = {
  id: string
  name: string
  groups: LeaderOptionGroup[]
}

export async function getLeaderOptions(
  /** The asker's current group, excluded so they can't request the one they're in. */
  excludeGroupId?: string | null
): Promise<LeaderOption[]> {
  const groups = await db.smallGroup.findMany({
    where: {
      status: "Active",
      ...(excludeGroupId ? { id: { not: excludeGroupId } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      leaderId: true,
      groupType: true,
      meetingFormat: true,
      scheduleDayOfWeek: true,
      scheduleTimeStart: true,
      scheduleTimeEnd: true,
      leader: { select: { firstName: true, lastName: true } },
    },
  })

  const leaderMap = new Map<string, LeaderOption>()
  for (const g of groups) {
    if (!g.leaderId || !g.leader) continue
    let entry = leaderMap.get(g.leaderId)
    if (!entry) {
      entry = {
        id: g.leaderId,
        name: `${g.leader.firstName} ${g.leader.lastName}`,
        groups: [],
      }
      leaderMap.set(g.leaderId, entry)
    }
    entry.groups.push({
      id: g.id,
      name: g.name,
      groupType: g.groupType,
      meetingFormat: g.meetingFormat,
      scheduleDayOfWeek: g.scheduleDayOfWeek,
      scheduleTimeStart: g.scheduleTimeStart,
      scheduleTimeEnd: g.scheduleTimeEnd,
    })
  }

  return Array.from(leaderMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
