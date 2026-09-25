"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching"
import { formatPhilippinePhone } from "@/lib/utils"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Schemas ───────────────────────────────────────────────────────────────────

const personalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Mobile number is required").transform((v) => formatPhilippinePhone(v.trim())),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  gender: z.enum(["Male", "Female", ""]).optional(),
  lifeStageId: z.string().optional(),
  birthMonth: z.string().optional(),
  birthYear: z.string().optional(),
})

const matchingPrefsSchema = z.object({
  language: z.array(z.string()),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson", ""]).optional(),
  scheduleDayOfWeek: z.string().optional(),
  scheduleTimeStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  scheduleTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
})

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>
export type MatchingPrefsValues = z.infer<typeof matchingPrefsSchema>

// ─── Enriched result type ─────────────────────────────────────────────────────

export type JoinMatchResult = MatchResult & {
  leaderFirstName: string
  leaderLastName: string
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
  language: string[]
  meetingFormat: string | null
}

// ─── submitJoinForm ───────────────────────────────────────────────────────────
//
// 1. Upsert Guest by phone (or create if not found)
// 2. Save matching preferences to Guest record
// 3. Run matchSmallGroups and return top 5 results with group details

export async function submitJoinForm(
  personal: PersonalInfoValues,
  prefs: MatchingPrefsValues,
  eventId?: string
): Promise<ActionResult<{ guestId: string; results: JoinMatchResult[] }>> {
  const parsedPersonal = personalInfoSchema.safeParse(personal)
  if (!parsedPersonal.success) {
    return { success: false, error: parsedPersonal.error.issues[0]?.message ?? "Invalid input" }
  }

  const parsedPrefs = matchingPrefsSchema.safeParse(prefs)
  if (!parsedPrefs.success) {
    return { success: false, error: parsedPrefs.error.issues[0]?.message ?? "Invalid input" }
  }

  const p = parsedPersonal.data
  const m = parsedPrefs.data

  try {
    if (eventId && !(await isEventJoinFormAvailable(eventId))) {
      return { success: false, error: "This DGroup form is unavailable." }
    }
    // Upsert guest by phone
    const existing = await db.guest.findFirst({
      where: { phone: p.phone, memberId: null },
      select: { id: true },
    })

    const guestData = {
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email || null,
      gender: (p.gender || null) as "Male" | "Female" | null,
      lifeStageId: p.lifeStageId || null,
      birthMonth: p.birthMonth ? parseInt(p.birthMonth, 10) : null,
      birthYear: p.birthYear ? parseInt(p.birthYear, 10) : null,
      language: m.language,
      meetingPreference: (m.meetingPreference || null) as "Online" | "Hybrid" | "InPerson" | null,
      scheduleDayOfWeek: m.scheduleDayOfWeek ? parseInt(m.scheduleDayOfWeek) : null,
      scheduleTimeStart: m.scheduleTimeStart || null,
      scheduleTimeEnd: m.scheduleTimeEnd || null,
    }

    let guestId: string

    if (existing) {
      await db.guest.update({ where: { id: existing.id }, data: guestData })
      guestId = existing.id
    } else {
      const guest = await db.guest.create({ data: { ...guestData, phone: p.phone } })
      guestId = guest.id
    }

    const eventGroupIds = eventId ? await getEventLeaderGroupIds(eventId) : undefined
    const matchResults = await matchSmallGroups({ guestId }, { limit: 5, includeGroupIds: eventGroupIds })

    if (matchResults.length === 0) {
      return { success: true, data: { guestId, results: [] } }
    }

    // Fetch display details for matched groups
    const groups = await db.smallGroup.findMany({
      where: { id: { in: matchResults.map((r) => r.groupId) } },
      select: {
        id: true,
        language: true,
        meetingFormat: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
        leader: { select: { firstName: true, lastName: true } },
      },
    })

    const groupMap = new Map(groups.map((g) => [g.id, g]))

    const results: JoinMatchResult[] = matchResults.flatMap((r) => {
      const g = groupMap.get(r.groupId)
      if (!g) return []
      return [
        {
          ...r,
          leaderFirstName: g.leader?.firstName ?? "",
          leaderLastName: g.leader?.lastName ?? "",
          scheduleDayOfWeek: g.scheduleDayOfWeek,
          scheduleTimeStart: g.scheduleTimeStart,
          scheduleTimeEnd: g.scheduleTimeEnd,
          language: g.language,
          meetingFormat: g.meetingFormat,
        },
      ]
    })

    return { success: true, data: { guestId, results } }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

// ─── requestToJoinGroup ───────────────────────────────────────────────────────
//
// Creates a SmallGroupMemberRequest for the guest.
// If a pending request already exists for any group, returns hasPendingRequest: true
// so the client can prompt the user to cancel the existing one first.

export type RequestResult =
  | { success: true }
  | { success: false; error: string }
  | {
      hasPendingRequest: true
      existingRequestId: string
      existingGroupId: string
      existingGroupName: string
    }

export async function requestToJoinGroup(
  guestId: string,
  groupId: string,
  eventId?: string
): Promise<RequestResult> {
  try {
    if (eventId && !(await isEventJoinFormAvailable(eventId))) {
      return { success: false, error: "This DGroup form is unavailable." }
    }
    if (eventId && !(await isEventLeaderGroup(eventId, groupId))) {
      return { success: false, error: "That DGroup is not available for this event." }
    }
    const existingRequest = await db.smallGroupMemberRequest.findFirst({
      where: { guestId, status: "Pending" },
      select: {
        id: true,
        smallGroup: { select: { id: true, name: true } },
      },
    })

    if (existingRequest?.smallGroup) {
      return {
        hasPendingRequest: true,
        existingRequestId: existingRequest.id,
        existingGroupId: existingRequest.smallGroup.id,
        existingGroupName: existingRequest.smallGroup.name,
      }
    }

    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: { firstName: true, lastName: true },
    })
    if (!guest) return { success: false, error: "Guest not found" }

    await db.$transaction([
      db.smallGroupMemberRequest.create({
        data: { guestId, smallGroupId: groupId },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: "TempAssignmentCreated",
          guestId,
          description: `${guest.firstName} ${guest.lastName} requested to join via the public join page`,
        },
      }),
    ])

    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

// ─── cancelAndRequestGroup ────────────────────────────────────────────────────
//
// Cancels an existing pending request then creates a new one for a different group.

export async function cancelAndRequestGroup(
  guestId: string,
  existingRequestId: string,
  newGroupId: string,
  eventId?: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (eventId && !(await isEventJoinFormAvailable(eventId))) {
      return { success: false, error: "This DGroup form is unavailable." }
    }
    if (eventId && !(await isEventLeaderGroup(eventId, newGroupId))) {
      return { success: false, error: "That DGroup is not available for this event." }
    }
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: { firstName: true, lastName: true },
    })
    if (!guest) return { success: false, error: "Guest not found" }

    const existing = await db.smallGroupMemberRequest.findUnique({
      where: { id: existingRequestId },
      select: { smallGroupId: true, guestId: true, status: true },
    })
    // A groupless request is a Catch Mech decline, never a pending join request.
    if (
      !existing?.smallGroupId ||
      existing.guestId !== guestId ||
      existing.status !== "Pending"
    ) return { success: false, error: "Request not found" }

    await db.$transaction([
      db.smallGroupMemberRequest.update({
        where: { id: existingRequestId },
        data: { status: "Rejected", resolvedAt: new Date() },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: existing.smallGroupId,
          action: "TempAssignmentRejected",
          guestId,
          description: `${guest.firstName} ${guest.lastName} cancelled their request (replaced with a new one)`,
        },
      }),
      db.smallGroupMemberRequest.create({
        data: { guestId, smallGroupId: newGroupId },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: newGroupId,
          action: "TempAssignmentCreated",
          guestId,
          description: `${guest.firstName} ${guest.lastName} requested to join via the public join page`,
        },
      }),
    ])

    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

async function getEventLeaderGroupIds(eventId: string): Promise<string[]> {
  const groups = await db.smallGroup.findMany({
    where: { leader: { volunteers: { some: { eventId, status: "Confirmed" } } } },
    select: { id: true },
  })
  return groups.map((group) => group.id)
}

async function isEventJoinFormAvailable(eventId: string): Promise<boolean> {
  const [event, config] = await Promise.all([
    db.event.findUnique({
      where: { id: eventId },
      select: { modules: { where: { type: "Volunteers" }, select: { id: true } } },
    }),
    db.formConfig.findUnique({ where: { scopeKey: `${eventId}:EventJoinSmallGroup` }, select: { isOpen: true } }),
  ])
  return !!event?.modules.length && (config?.isOpen ?? true)
}

async function isEventLeaderGroup(eventId: string, groupId: string): Promise<boolean> {
  return (await db.smallGroup.count({
    where: { id: groupId, leader: { volunteers: { some: { eventId, status: "Confirmed" } } } },
  })) > 0
}
