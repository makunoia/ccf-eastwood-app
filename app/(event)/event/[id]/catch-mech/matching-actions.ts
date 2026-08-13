"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { repointFamilyLinks, findSpouseOfPerson } from "@/lib/family-links"
import {
  PROMOTABLE_GUEST_SELECT,
  promoteGuestRecord,
  type PromotableGuest,
} from "@/lib/people/promote-guest"
import { matchSmallGroups } from "@/lib/matching"
import { scoreGroup } from "@/lib/matching/engine"
import { scoreGender, scoreLifeStage, scoreSchedule } from "@/lib/matching/scorers"
import { DEFAULT_WEIGHTS } from "@/lib/validations/matching-weights"
import { MatchingContext } from "@/app/generated/prisma/client"
import { buildStoredScheduleSlot } from "@/lib/matching/candidate-schedule"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import { logMembershipMove } from "@/lib/small-groups/membership-log"
import type { MatchResult, CandidateProfile, TimeSlot } from "@/lib/matching/types"

/** Meeting times are optional — a day-only schedule still yields a slot. */
function slotList(
  dayOfWeek: number | null,
  timeStart: string | null,
  timeEnd: string | null
): TimeSlot[] {
  const slot = buildStoredScheduleSlot(dayOfWeek, timeStart, timeEnd)
  return slot ? [slot] : []
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// Volunteer info attached to each match when scope = "volunteers"
export type VolunteerInfo = {
  committeeName: string
  roleName: string // assignedRole ?? preferredRole
}

export type CatchMechMatchResult = MatchResult & {
  volunteerInfo?: VolunteerInfo
}

export type CatchMechEscalationLevel = {
  level: 1 | 2 | 3
  source: "event-volunteers" | "all-small-groups"
  matches: CatchMechMatchResult[]
}

// ─── Build candidate profile from registrantId ───────────────────────────────

async function buildCandidateForRegistrant(
  registrantId: string
): Promise<CandidateProfile | null> {
  const registrant = await db.eventRegistrant.findUnique({
    where: { id: registrantId },
    select: {
      guest: {
        select: {
          lifeStageId: true,
          gender: true,
          language: true,
          birthMonth: true,
          birthYear: true,
          workCity: true,
          workIndustry: true,
          ageRangeBucketId: true,
          meetingPreference: true,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
        },
      },
      member: {
        select: {
          lifeStageId: true,
          gender: true,
          language: true,
          birthMonth: true,
          birthYear: true,
          workCity: true,
          workIndustry: true,
          ageRangeBucketId: true,
          meetingPreference: true,
          schedulePreferences: {
            select: { dayOfWeek: true, timeStart: true, timeEnd: true },
          },
        },
      },
    },
  })

  if (!registrant) return null

  if (registrant.guest) {
    const g = registrant.guest
    return {
      lifeStageId: g.lifeStageId,
      gender: g.gender,
      language: g.language,
      birthMonth: g.birthMonth,
      birthYear: g.birthYear,
      workCity: g.workCity,
      workIndustry: g.workIndustry,
      meetingPreference: g.meetingPreference,
      scheduleSlots: slotList(g.scheduleDayOfWeek, g.scheduleTimeStart, g.scheduleTimeEnd),
    }
  }

  if (registrant.member) {
    const m = registrant.member
    return {
      lifeStageId: m.lifeStageId,
      gender: m.gender,
      language: m.language,
      birthMonth: m.birthMonth,
      birthYear: m.birthYear,
      workCity: m.workCity,
      workIndustry: m.workIndustry,
      meetingPreference: m.meetingPreference,
      scheduleSlots: m.schedulePreferences
        .map((s) => buildStoredScheduleSlot(s.dayOfWeek, s.timeStart, s.timeEnd))
        .filter((s) => s !== null),
    }
  }

  return null
}

// ─── findCatchMechSmallGroupMatches ──────────────────────────────────────────

export async function findCatchMechSmallGroupMatches(
  registrantId: string,
  eventId: string,
  scope: "volunteers" | "all"
): Promise<ActionResult<CatchMechEscalationLevel[]>> {
  try {
    const candidate = await buildCandidateForRegistrant(registrantId)
    if (!candidate) {
      return { success: false, error: "Registrant not found" }
    }

    // Couples groups are only suggestable when the person has a spouse on record
    const registrantRefs = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { guestId: true, memberId: true },
    })
    const spouse = registrantRefs?.memberId
      ? await findSpouseOfPerson({ memberId: registrantRefs.memberId })
      : registrantRefs?.guestId
        ? await findSpouseOfPerson({ guestId: registrantRefs.guestId })
        : null
    const hasSpouse = spouse !== null

    const weightConfig = await db.matchingWeightConfig.findUnique({
      where: { context: MatchingContext.SmallGroup },
    })
    const weights = weightConfig ?? DEFAULT_WEIGHTS

    if (scope === "volunteers") {
      // Fetch confirmed volunteers who lead a small group
      const volunteers = await db.volunteer.findMany({
        where: {
          eventId,
          status: "Confirmed",
          member: { ledGroups: { some: {} } },
        },
        select: {
          memberId: true,
          committee: { select: { name: true } },
          assignedRole: { select: { name: true } },
          preferredRole: { select: { name: true } },
          member: {
            select: {
              ledGroups: {
                select: { id: true },
              },
            },
          },
        },
      })

      // Map smallGroupId → VolunteerInfo (first volunteer found leads that group)
      const volunteerInfoMap = new Map<string, VolunteerInfo>()
      const volunteerGroupIds: string[] = []

      for (const v of volunteers) {
        for (const group of v.member.ledGroups) {
          if (!volunteerInfoMap.has(group.id)) {
            volunteerInfoMap.set(group.id, {
              committeeName: v.committee.name,
              roleName: v.assignedRole?.name ?? v.preferredRole.name,
            })
            volunteerGroupIds.push(group.id)
          }
        }
      }

      if (volunteerGroupIds.length === 0) {
        return { success: true, data: [] }
      }

      const SMALL_GROUP_SCORE_SELECT = {
        id: true,
        name: true,
        groupType: true,
        lifeStages: { select: { id: true, name: true } },
        genderFocus: true,
        language: true,
        ageRangeMin: true,
        ageRangeMax: true,
        meetingFormat: true,
        locationCity: true,
        memberLimit: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
        _count: { select: { members: true } },
        members: { select: { workIndustry: true } },
      } as const

      const groups = await db.smallGroup.findMany({
        where: { id: { in: volunteerGroupIds } },
        select: SMALL_GROUP_SCORE_SELECT,
      })

      const eligible = groups.filter((g) => {
        if (g.groupType === "Couples" && !hasSpouse) return false
        if (g.memberLimit !== null && g._count.members >= g.memberLimit) return false
        const scheduleSlots = slotList(g.scheduleDayOfWeek, g.scheduleTimeStart, g.scheduleTimeEnd)
        if (scoreGender(candidate.gender, g.genderFocus) === 0.0) return false
        if (scoreLifeStage(candidate.lifeStageId, g.lifeStages.map((ls) => ls.id)) === 0.0) return false
        if (scheduleSlots.length > 0 && scoreSchedule(candidate.scheduleSlots, scheduleSlots) === 0.0) return false
        return true
      })

      const scored: CatchMechMatchResult[] = eligible
        .map((g) => {
          const memberIndustries = g.members
            .map((m) => m.workIndustry)
            .filter((i): i is string => i != null)
          const profile = {
            id: g.id,
            name: g.name,
            lifeStageIds: g.lifeStages.map((ls) => ls.id),
            lifeStageNames: g.lifeStages.map((ls) => ls.name),
            genderFocus: g.genderFocus,
            language: g.language,
            ageRangeMin: g.ageRangeMin,
            ageRangeMax: g.ageRangeMax,
            meetingFormat: g.meetingFormat,
            locationCity: g.locationCity,
            memberLimit: g.memberLimit,
            currentCount: g._count.members,
            memberIndustries,
            scheduleSlots: slotList(g.scheduleDayOfWeek, g.scheduleTimeStart, g.scheduleTimeEnd),
          }
          const result = scoreGroup(candidate, profile, weights)
          return {
            ...result,
            volunteerInfo: volunteerInfoMap.get(g.id),
          }
        })
        .sort((a, b) => b.totalScore - a.totalScore)

      if (scored.length === 0) return { success: true, data: [] }
      return {
        success: true,
        data: [{ level: 1, source: "event-volunteers", matches: scored }],
      }
    }

    // scope === "all"
    if (!registrantRefs) return { success: false, error: "Registrant not found" }

    let results: MatchResult[]
    if (registrantRefs.guestId) {
      results = await matchSmallGroups(
        { guestId: registrantRefs.guestId },
        { limit: 10, includeCouplesGroups: hasSpouse }
      )
    } else if (registrantRefs.memberId) {
      results = await matchSmallGroups(
        { memberId: registrantRefs.memberId },
        { limit: 10, includeCouplesGroups: hasSpouse }
      )
    } else {
      results = []
    }

    if (results.length === 0) return { success: true, data: [] }
    return {
      success: true,
      data: [{ level: 3, source: "all-small-groups", matches: results }],
    }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}

// ─── addCatchMechComment ─────────────────────────────────────────────────────

export async function addCatchMechComment(
  requestId: string,
  text: string
): Promise<ActionResult<void>> {
  const session = await auth()
  const authorId = session?.user?.id
  if (!authorId) return { success: false, error: "Not authenticated" }
  if (!text.trim()) return { success: false, error: "Comment cannot be empty" }
  try {
    await db.catchMechComment.create({
      data: { requestId, authorId, text: text.trim() },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add comment" }
  }
}

// ─── assignCatchMechRegistrantToGroup ────────────────────────────────────────

export async function assignCatchMechRegistrantToGroup(
  registrantId: string,
  eventId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { guestId: true, memberId: true },
    })
    if (!registrant) return { success: false, error: "Registrant not found" }

    // Find the event's breakout group IDs to scope the lookup
    const eventBreakoutGroups = await db.breakoutGroup.findMany({
      where: { eventId },
      select: { id: true },
    })
    const breakoutGroupIds = eventBreakoutGroups.map((bg) => bg.id)

    // Find existing Rejected request for this registrant in this event
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: {
        status: "Rejected",
        breakoutGroupId: { in: breakoutGroupIds },
        ...(registrant.guestId ? { guestId: registrant.guestId } : { memberId: registrant.memberId }),
      },
    })

    if (existing) {
      await db.smallGroupMemberRequest.update({
        where: { id: existing.id },
        data: {
          status: "Pending",
          smallGroupId: groupId,
          resolvedAt: null,
        },
      })
    } else {
      // Edge case: create new Pending request
      await db.smallGroupMemberRequest.create({
        data: {
          status: "Pending",
          smallGroupId: groupId,
          guestId: registrant.guestId ?? undefined,
          memberId: registrant.memberId ?? undefined,
          breakoutGroupId: breakoutGroupIds[0] ?? undefined,
        },
      })
    }

    revalidatePath(`/event/${eventId}/catch-mech/rejected`)
    revalidatePath(`/event/${eventId}/catch-mech/rejected/${registrantId}`)
    revalidatePath(`/event/${eventId}/catch-mech/pending`)

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign to group" }
  }
}

// ─── reopenCatchMechRequest (admin undo of a confirm/reject decision) ─────────

export async function reopenCatchMechRequest(
  requestId: string,
  eventId: string
): Promise<ActionResult<void>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canWrite(session, "SmallGroups")) return { success: false, error: "Unauthorized." }
  const actorId = session.user.id ?? null

  try {
    const request = await db.smallGroupMemberRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        smallGroupId: true,
        memberId: true,
        guestId: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guest: { select: { id: true } },
          },
        },
      },
    })
    if (!request) return { success: false, error: "Request not found" }
    if (request.status !== "Confirmed" && request.status !== "Rejected") {
      return { success: false, error: "Only confirmed or rejected decisions can be undone" }
    }

    // A groupless decline (a Timothy who leads no group yet) has no group to reopen
    // into, so undoing it means dropping the record — that alone returns the person
    // to the faci's list. No log either: SmallGroupLog is group-scoped.
    const smallGroupId = request.smallGroupId
    if (!smallGroupId) {
      await db.smallGroupMemberRequest.delete({ where: { id: request.id } })
      revalidatePath(`/event/${eventId}/catch-mech`, "layout")
      revalidatePath(`/event/${eventId}/dashboard`)
      return { success: true, data: undefined }
    }

    await db.$transaction(async (tx) => {
      // ── Rejected → Pending: simply reopen the request ──────────────────────
      if (request.status === "Rejected") {
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null, declineReason: null, notes: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "TempAssignmentCreated",
            memberId: request.memberId ?? null,
            guestId: request.guestId ?? null,
            performedByUserId: actorId,
            description: "Rejection reopened by admin (pending leader confirmation)",
          },
        })
        return
      }

      // ── Confirmed → full reversal ──────────────────────────────────────────
      const member = request.member
      if (member?.guest) {
        // Promoted guest: undo the promotion entirely and restore the guest.
        const guestId = member.guest.id
        await tx.guest.update({ where: { id: guestId }, data: { memberId: null } })
        await tx.eventRegistrant.updateMany({
          where: { memberId: member.id },
          data: { guestId, memberId: null },
        })
        // Clear the request's memberId BEFORE deleting the member — the FK cascades.
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null, guestId, memberId: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "MemberRemoved",
            guestId,
            performedByUserId: actorId,
            description: `${member.firstName} ${member.lastName}'s confirmation was undone — restored to guest`,
          },
        })
        // Restore family links to the guest BEFORE deleting the member — the FK cascades.
        await repointFamilyLinks(tx, { memberId: member.id }, { guestId })
        await tx.member.delete({ where: { id: member.id } })
        return
      }

      // Already a real member: remove from the group, keep the member record.
      if (member) {
        await tx.member.update({
          where: { id: member.id },
          data: { smallGroupId: null, groupStatus: null },
        })
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "MemberRemoved",
            memberId: member.id,
            performedByUserId: actorId,
            description: `${member.firstName} ${member.lastName}'s confirmation was undone — removed from the group`,
          },
        })
      }
    })

    revalidatePath(`/event/${eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${eventId}/dashboard`)
    revalidatePath(`/event/${eventId}/breakouts`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to undo decision" }
  }
}

// ─── confirmCatchMechCoupleRequests ──────────────────────────────────────────
// Admin override: confirms BOTH halves of a couple's pending requests into the
// same Couples group in one transaction. Mirrors the leader confirmation flow
// (guest promotion with email reuse, registrant + family-link repointing,
// member transfer, audit logs) so either path leaves identical state.

type CoupleRequestRecord = {
  id: string
  status: string
  smallGroupId: string
  guestId: string | null
  memberId: string | null
  fromGroupId: string | null
  // Derived, not spelled out: the promotable field list has to stay in lockstep
  // with what `promoteGuestRecord` copies.
  guest: (PromotableGuest & { member: { id: string; smallGroupId: string | null } | null }) | null
  member: { id: string; firstName: string; lastName: string; smallGroupId: string | null } | null
}

const COUPLE_REQUEST_SELECT = {
  id: true,
  status: true,
  smallGroupId: true,
  guestId: true,
  memberId: true,
  fromGroupId: true,
  guest: {
    select: {
      ...PROMOTABLE_GUEST_SELECT,
      member: { select: { id: true, smallGroupId: true } },
    },
  },
  member: { select: { id: true, firstName: true, lastName: true, smallGroupId: true } },
} as const

export async function confirmCatchMechCoupleRequests(
  eventId: string,
  requestIdA: string,
  requestIdB: string
): Promise<ActionResult<void>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canWrite(session, "SmallGroups")) return { success: false, error: "Unauthorized." }
  if (requestIdA === requestIdB) {
    return { success: false, error: "Two different requests are required" }
  }

  try {
    const requests = (await db.smallGroupMemberRequest.findMany({
      where: { id: { in: [requestIdA, requestIdB] } },
      select: COUPLE_REQUEST_SELECT,
    })) as CoupleRequestRecord[]
    if (requests.length !== 2) return { success: false, error: "Requests not found" }

    const [reqA, reqB] = requests
    if (reqA.smallGroupId !== reqB.smallGroupId) {
      return { success: false, error: "Both requests must target the same group" }
    }
    if (reqA.status !== "Pending" || reqB.status !== "Pending") {
      return { success: false, error: "Both requests must still be pending" }
    }

    const group = await db.smallGroup.findUnique({
      where: { id: reqA.smallGroupId },
      select: {
        id: true,
        name: true,
        status: true,
        groupType: true,
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Group not found" }
    if (group.groupType !== "Couples") {
      return { success: false, error: "Confirm both is only available for couples groups" }
    }

    // Seats needed: each half occupies a seat unless already a member of this group
    const seatsNeeded = requests.filter((r) => {
      const existingMemberGroupId = r.guest?.member?.smallGroupId ?? r.member?.smallGroupId ?? null
      return existingMemberGroupId !== group.id
    }).length
    if (group.memberLimit !== null && group._count.members + seatsNeeded > group.memberLimit) {
      return {
        success: false,
        error: `Confirming both would exceed the member limit of ${group.memberLimit}`,
      }
    }

    const now = new Date()
    await db.$transaction(async (tx) => {
      // Existing members confirmed here — the only ones who can lead a group and
      // so hold a declared satellite. A freshly promoted guest leads nothing.
      const confirmedMemberIds: string[] = []

      for (const req of requests) {
        let promotedMemberId: string | null = null

        if (req.guestId && req.guest) {
          const guest = req.guest
          if (!guest.memberId) {
            // `reuseExistingMemberByEmail` avoids a P2002 on the unique Member.email.
            // Seat capacity for the pair was already checked above.
            const promoted = await promoteGuestRecord(tx, {
              guestId: req.guestId,
              guest,
              dateJoined: now,
              group,
              reuseExistingMemberByEmail: true,
              schedule: "normalized",
            })
            promotedMemberId = promoted.memberId

            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "TempAssignmentConfirmed",
                guestId: req.guestId,
                memberId: promotedMemberId,
                performedByUserId: session.user.id ?? null,
                description: `${guest.firstName} ${guest.lastName} was confirmed by admin as part of a couple and promoted to member`,
              },
            })
            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "MemberAdded",
                memberId: promotedMemberId,
                performedByUserId: session.user.id ?? null,
                description: `${guest.firstName} ${guest.lastName} joined the group (couple confirmation)`,
              },
            })
          } else {
            // Guest already promoted elsewhere — move the linked member in
            promotedMemberId = guest.memberId
            await tx.member.update({
              where: { id: guest.memberId },
              data: { smallGroupId: group.id, groupStatus: "Member" },
            })
            // That member may already sit in a group, so this is a move, not just
            // an arrival — `logMembershipMove` records whichever it turns out to be.
            await logMembershipMove(tx, {
              memberId: guest.memberId,
              memberName: `${guest.firstName} ${guest.lastName}`,
              fromGroupId: guest.member?.smallGroupId ?? null,
              toGroupId: group.id,
              actor: { userId: session.user.id ?? null },
              context: "(couple confirmation)",
            })
          }
        } else if (req.memberId && req.member) {
          const memberName = `${req.member.firstName} ${req.member.lastName}`
          // Where they actually are, not `req.fromGroupId` — that records the group
          // the request was raised against and is null for a request that never
          // named one, which would lose the departure entirely.
          const fromGroupId = req.member.smallGroupId
          await tx.member.update({
            where: { id: req.memberId },
            data: { smallGroupId: group.id, groupStatus: "Member" },
          })
          confirmedMemberIds.push(req.memberId)
          await tx.smallGroupLog.create({
            data: {
              smallGroupId: group.id,
              action: "TempAssignmentConfirmed",
              memberId: req.memberId,
              fromGroupId: req.fromGroupId ?? null,
              toGroupId: group.id,
              performedByUserId: session.user.id ?? null,
              description: `${memberName} was confirmed by admin as part of a couple`,
            },
          })
          // Writes the departure into the old group too, which the single
          // destination-side entry here used to drop.
          await logMembershipMove(tx, {
            memberId: req.memberId,
            memberName,
            fromGroupId,
            toGroupId: group.id,
            actor: { userId: session.user.id ?? null },
            context: "(couple confirmation)",
          })
        }

        await tx.smallGroupMemberRequest.update({
          where: { id: req.id },
          data: {
            status: "Confirmed",
            resolvedAt: now,
            ...(req.guestId && promotedMemberId
              ? { memberId: promotedMemberId, guestId: null }
              : {}),
          },
        })
      }

      await clearUpwardSatelliteOnConfirm(tx, confirmedMemberIds)

      if (group.status === "Pending") {
        await tx.smallGroup.update({ where: { id: group.id }, data: { status: "Active" } })
      }
    })

    revalidatePath(`/event/${eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${eventId}/dashboard`)
    revalidatePath("/small-groups")
    revalidatePath(`/small-groups/${group.id}`)
    revalidatePath("/guests")
    revalidatePath("/members")
    return { success: true, data: undefined }
  } catch (e) {
    console.error("[confirmCatchMechCoupleRequests] error:", e)
    return { success: false, error: "Failed to confirm the couple" }
  }
}
