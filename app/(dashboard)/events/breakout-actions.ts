"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite, canAccessEvent } from "@/lib/permissions"
import { breakoutGroupSchema } from "@/lib/validations/breakout-group"
import type { BreakoutGroupFormValues } from "@/lib/validations/breakout-group"
import { matchBreakoutGroups } from "@/lib/matching"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
import { MAX_BREAKOUT_BATCH } from "@/lib/breakouts/candidate-filters"
import { registrantName, registrantNameSelect } from "@/lib/metadata"
import type { BatchFailure } from "@/components/batch/types"
import {
  tryCreateSmallGroupRequestFromBreakout,
  tryCancelSmallGroupRequestFromBreakout,
  tryTransferSmallGroupRequestFromBreakout,
} from "@/lib/create-small-group-request"
import { clearedMatchingProfile, missingTimothyFields } from "@/lib/breakouts/profile"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Write access to one event's data.
 *
 * Middleware gates `/event/<id>` by feature + event access, but on the *URL's*
 * event id — a server action carries its own argument, so a user scoped to
 * event A could otherwise pass event B's id from A's page.
 */
async function requireEventWrite(eventId: string): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

// ─── Timothy profile validation ───────────────────────────────────────────────

/**
 * When a facilitator volunteer is a Timothy (has no led small groups),
 * the breakout group's matching profile must be filled in so that the system
 * has enough data to set up their future small group.
 *
 * `missingTimothyFields` is shared with both edit drawers so the client can't
 * accept a profile this rejects.
 */
async function validateTimothyProfile(
  facilitatorId: string | null | undefined,
  profile: Parameters<typeof missingTimothyFields>[0]
): Promise<string | null> {
  if (!facilitatorId) return null

  const volunteer = await db.volunteer.findUnique({
    where: { id: facilitatorId },
    select: { member: { select: { _count: { select: { ledGroups: true } } } } },
  })
  if (!volunteer) return null

  const isTimothy = volunteer.member._count.ledGroups === 0
  if (!isTimothy) return null

  const missing = missingTimothyFields(profile)
  if (missing.length > 0) {
    return `Timothy profile requires: ${missing.join(", ")}`
  }
  return null
}

// ─── Breakout Group CRUD ──────────────────────────────────────────────────────

export async function createBreakoutGroup(
  eventId: string,
  data: BreakoutGroupFormValues
): Promise<ActionResult<{ id: string }>> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  const parsed = breakoutGroupSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, facilitatorId, coFacilitatorId, memberLimit, linkedSmallGroupId, ...profile } = parsed.data

  const timothyError = await validateTimothyProfile(facilitatorId, profile)
  if (timothyError) return { success: false, error: timothyError }

  try {
    const group = await db.breakoutGroup.create({
      data: {
        eventId,
        name,
        facilitatorId: facilitatorId ?? null,
        coFacilitatorId: coFacilitatorId ?? null,
        memberLimit: memberLimit ?? null,
        linkedSmallGroupId: linkedSmallGroupId ?? null,
        lifeStages: { connect: profile.lifeStageIds.map((id) => ({ id })) },
        genderFocus: profile.genderFocus ?? null,
        language: profile.language,
        ageRangeMin: profile.ageRangeMin ?? null,
        ageRangeMax: profile.ageRangeMax ?? null,
      },
      select: { id: true },
    })
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: { id: group.id } }
  } catch {
    return { success: false, error: "Failed to create breakout group" }
  }
}

export async function updateBreakoutGroup(
  groupId: string,
  eventId: string,
  data: BreakoutGroupFormValues
): Promise<ActionResult> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  const parsed = breakoutGroupSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, facilitatorId, coFacilitatorId, memberLimit, linkedSmallGroupId, ...profile } = parsed.data

  const timothyError = await validateTimothyProfile(facilitatorId, profile)
  if (timothyError) return { success: false, error: timothyError }

  // Scoped by event: `requireEventWrite` checks the *argument* event, so without
  // this an admin scoped to event A could pass event B's group id.
  const existing = await db.breakoutGroup.findFirst({
    where: { id: groupId, eventId },
    select: { facilitatorId: true, coFacilitatorId: true },
  })
  if (!existing) return { success: false, error: "Breakout group not found" }

  // An absent key means "not on the form", not "clear it". Neither edit drawer
  // has a co-facilitator control — that slot is assigned from the detail page —
  // so writing `coFacilitatorId ?? null` silently detached the co-facilitator on
  // every save from either drawer.
  const nextFacilitatorId = facilitatorId === undefined ? existing.facilitatorId : facilitatorId
  const nextCoFacilitatorId =
    coFacilitatorId === undefined ? existing.coFacilitatorId : coFacilitatorId

  // The schema compares the two *submitted* ids; it can't see a stored one that
  // wasn't submitted, so the same volunteer could land in both slots.
  if (nextFacilitatorId !== null && nextFacilitatorId === nextCoFacilitatorId) {
    return {
      success: false,
      error: "Facilitator and co-facilitator must be different volunteers",
    }
  }

  // Emptying the facilitator slot clears the profile, whatever the form sent —
  // the drawer blanks its own fields on the same change, but the server is the
  // one that decides. It's the *transition* that clears: a group created without
  // a facilitator keeps criteria someone typed, and later saves don't wipe them.
  const unlinkedFacilitator = existing.facilitatorId !== null && nextFacilitatorId === null

  try {
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: {
        name,
        facilitatorId: nextFacilitatorId,
        coFacilitatorId: nextCoFacilitatorId,
        memberLimit: memberLimit ?? null,
        ...(unlinkedFacilitator
          ? { linkedSmallGroupId: null, ...clearedMatchingProfile() }
          : {
              linkedSmallGroupId: linkedSmallGroupId ?? null,
              lifeStages: { set: profile.lifeStageIds.map((id) => ({ id })) },
              genderFocus: profile.genderFocus ?? null,
              language: profile.language,
              ageRangeMin: profile.ageRangeMin ?? null,
              ageRangeMax: profile.ageRangeMax ?? null,
            }),
      },
    })
    revalidatePath(`/event/${eventId}/breakouts`)
    // The edit drawer is mounted on the detail page too.
    revalidatePath(`/event/${eventId}/breakouts/${groupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update breakout group" }
  }
}

export async function deleteBreakoutGroup(
  groupId: string,
  eventId: string
): Promise<ActionResult> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    await db.breakoutGroup.delete({ where: { id: groupId } })
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete breakout group" }
  }
}

// ─── Registrant assignment ────────────────────────────────────────────────────

const breakoutBatchSchema = z.object({
  groupId: z.string().min(1, "Breakout group is required"),
  eventId: z.string().min(1, "Event is required"),
  registrantIds: z
    .array(z.string().min(1))
    .max(MAX_BREAKOUT_BATCH, `Cannot add more than ${MAX_BREAKOUT_BATCH} registrants at once`),
})

/**
 * Every member who facilitates or co-facilitates *any* breakout group in this
 * event (CCF-87 — a facilitator can't also be a participant).
 *
 * One query for the whole event rather than a per-row lookup. Shared by the add
 * and transfer paths so the rule can't drift between them; `autoAssignRegistrantToBreakout`
 * keeps its own narrower existence check because it runs unauthenticated on the
 * public check-in path.
 */
async function eventFacilitatorMemberIds(eventId: string): Promise<Set<string>> {
  const groups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: {
      facilitator: { select: { memberId: true } },
      coFacilitator: { select: { memberId: true } },
    },
  })
  return new Set(
    groups.flatMap((g) =>
      [g.facilitator?.memberId, g.coFacilitator?.memberId].filter(
        (id): id is string => id != null
      )
    )
  )
}

/**
 * Add several registrants to a breakout group in one pass.
 *
 * This is the single entry point for placing anyone into a breakout group —
 * `assignRegistrantToBreakout` (the registrant detail page) delegates here with
 * a one-element array, so the guards below can't drift between the two callers.
 *
 * Every check runs server-side even though the picker pre-filters: its candidate
 * list is a snapshot that may be stale by the time Add is pressed.
 */
export async function addRegistrantsToBreakout(
  groupId: string,
  registrantIds: string[],
  eventId: string
): Promise<ActionResult<{ added: number; failed: BatchFailure[] }>> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  const parsed = breakoutBatchSchema.safeParse({ groupId, registrantIds, eventId })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const ids = [...new Set(parsed.data.registrantIds)]
  if (ids.length === 0) return { success: true, data: { added: 0, failed: [] } }

  try {
    // Scoped to the event, so an id from another event simply isn't found.
    const registrants = await db.eventRegistrant.findMany({
      where: { id: { in: ids }, eventId },
      select: {
        id: true,
        memberId: true,
        ...registrantNameSelect,
        breakoutGroupMemberships: { select: { breakoutGroupId: true }, take: 1 },
      },
    })
    const byId = new Map(registrants.map((r) => [r.id, r]))

    const facilitatorMemberIds = await eventFacilitatorMemberIds(eventId)

    const failed: BatchFailure[] = []
    const eligible: string[] = []

    for (const id of ids) {
      const registrant = byId.get(id)
      const name = registrantName(registrant, "Unknown")

      if (!registrant) {
        failed.push({ id, name, reason: "is not a registrant of this event" })
      } else if (registrant.breakoutGroupMemberships.length > 0) {
        failed.push({ id, name, reason: "is already in a breakout group" })
      } else if (registrant.memberId && facilitatorMemberIds.has(registrant.memberId)) {
        failed.push({ id, name, reason: "is a facilitator and cannot be a member" })
      } else {
        eligible.push(id)
      }
    }

    // Capacity is claimed under a row lock on the group.
    //
    // A transaction alone is NOT enough here: under Postgres' default READ
    // COMMITTED isolation two concurrent batches both read `count = 0`, both
    // decide there is room, and the group ends up over its limit. Updating the
    // group row first takes a FOR UPDATE lock, so the second batch blocks until
    // the first commits and then re-reads the true count (READ COMMITTED takes
    // a fresh snapshot per statement).
    const accepted = await db.$transaction(async (tx) => {
      const locked = await tx.breakoutGroup.updateMany({
        where: { id: groupId, eventId },
        data: { updatedAt: new Date() },
      })
      if (locked.count === 0) return null

      const group = await tx.breakoutGroup.findFirst({
        where: { id: groupId, eventId },
        select: { memberLimit: true, _count: { select: { members: true } } },
      })
      if (!group) return null

      const room =
        group.memberLimit === null ? eligible.length : group.memberLimit - group._count.members
      const take = Math.max(0, Math.min(eligible.length, room))

      if (take > 0) {
        await tx.breakoutGroupMember.createMany({
          data: eligible.slice(0, take).map((registrantId) => ({
            breakoutGroupId: groupId,
            registrantId,
          })),
          skipDuplicates: true,
        })
      }
      return eligible.slice(0, take)
    })

    if (accepted === null) return { success: false, error: "Breakout group not found" }

    for (const id of eligible.slice(accepted.length)) {
      failed.push({
        id,
        name: registrantName(byId.get(id), "Unknown"),
        reason: "would exceed the group's member limit",
      })
    }

    // Best-effort side effect, deliberately outside the transaction: a failure
    // to raise the small-group request must not roll back the placement.
    for (const id of accepted) {
      await tryCreateSmallGroupRequestFromBreakout(groupId, id)
    }

    revalidatePath(`/event/${eventId}/breakouts`)
    revalidatePath(`/event/${eventId}/breakouts/${groupId}`)
    revalidatePath(`/event/${eventId}/registrants`)

    return { success: true, data: { added: accepted.length, failed } }
  } catch {
    return { success: false, error: "Failed to add registrants to breakout group" }
  }
}

export async function removeRegistrantFromBreakout(
  groupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    await db.breakoutGroupMember.delete({
      where: { breakoutGroupId_registrantId: { breakoutGroupId: groupId, registrantId } },
    })
    await tryCancelSmallGroupRequestFromBreakout(groupId, registrantId)
    revalidatePath(`/event/${eventId}/breakouts`)
    // Session detail renders each group's capacity, so a removal moves a number
    // there too. The occurrence id isn't known here — revalidate the segment.
    revalidatePath(`/event/${eventId}/sessions`, "layout")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove registrant from breakout group" }
  }
}

const breakoutTransferSchema = z
  .object({
    fromGroupId: z.string().min(1, "Source breakout group is required"),
    toGroupId: z.string().min(1, "Destination breakout group is required"),
    registrantId: z.string().min(1, "Registrant is required"),
    eventId: z.string().min(1, "Event is required"),
  })
  .refine((d) => d.fromGroupId !== d.toGroupId, {
    message: "Pick a different breakout group",
    path: ["toGroupId"],
  })

/**
 * Move one registrant between breakout groups in a single atomic step (CCF-139).
 *
 * Composing remove + add would leave the registrant in *no* group between the
 * two calls — and permanently so if the add then failed on capacity. Both writes
 * happen in one transaction here, so a failure leaves them exactly where they
 * were.
 *
 * Order inside the transaction matters: `BreakoutGroupMember`'s primary key is
 * `[breakoutGroupId, registrantId]` and there is no unique on `registrantId`
 * alone, so "one group per registrant" is an application invariant the database
 * will not enforce. Creating before deleting would silently double-place them.
 */
export async function transferRegistrantToBreakout(
  fromGroupId: string,
  toGroupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  const parsed = breakoutTransferSchema.safeParse({
    fromGroupId,
    toGroupId,
    registrantId,
    eventId,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    // Scoped to the event, so an id from another event simply isn't found.
    const registrant = await db.eventRegistrant.findFirst({
      where: { id: registrantId, eventId },
      select: { id: true, memberId: true },
    })
    if (!registrant) {
      return { success: false, error: "Not a registrant of this event" }
    }

    // Re-checked rather than assumed: they passed this when first placed, but a
    // facilitator can have been appointed in the meantime.
    if (registrant.memberId) {
      const facilitatorMemberIds = await eventFacilitatorMemberIds(eventId)
      if (facilitatorMemberIds.has(registrant.memberId)) {
        return { success: false, error: "A facilitator cannot be a breakout group member" }
      }
    }

    // The compound-key delete below doesn't scope by event on its own.
    const source = await db.breakoutGroup.findFirst({
      where: { id: fromGroupId, eventId },
      select: { id: true },
    })
    if (!source) return { success: false, error: "Breakout group not found" }

    const outcome = await db.$transaction(async (tx) => {
      // Claim a seat under a row lock on the destination. A transaction alone is
      // NOT enough: under READ COMMITTED two concurrent transfers both read the
      // same count, both decide there is room, and the group ends up over its
      // limit. Updating the row first takes a FOR UPDATE lock, so the second
      // blocks until the first commits and then re-reads the true count.
      const locked = await tx.breakoutGroup.updateMany({
        where: { id: toGroupId, eventId },
        data: { updatedAt: new Date() },
      })
      if (locked.count === 0) return "missing-destination" as const

      const destination = await tx.breakoutGroup.findFirst({
        where: { id: toGroupId, eventId },
        select: { memberLimit: true, _count: { select: { members: true } } },
      })
      if (!destination) return "missing-destination" as const

      if (
        destination.memberLimit !== null &&
        destination._count.members >= destination.memberLimit
      ) {
        return "full" as const
      }

      const removed = await tx.breakoutGroupMember.deleteMany({
        where: { breakoutGroupId: fromGroupId, registrantId },
      })
      if (removed.count === 0) return "not-in-source" as const

      await tx.breakoutGroupMember.create({
        data: { breakoutGroupId: toGroupId, registrantId },
      })
      return "moved" as const
    })

    if (outcome === "missing-destination") {
      return { success: false, error: "Destination breakout group not found" }
    }
    if (outcome === "full") {
      return { success: false, error: "That breakout group is already at its member limit" }
    }
    if (outcome === "not-in-source") {
      return { success: false, error: "No longer a member of this breakout group" }
    }

    // Best-effort side effect, deliberately outside the transaction: a failure to
    // re-point the small-group request must not roll back the move.
    await tryTransferSmallGroupRequestFromBreakout(fromGroupId, toGroupId, registrantId)

    revalidatePath(`/event/${eventId}/breakouts`)
    revalidatePath(`/event/${eventId}/breakouts/${fromGroupId}`)
    revalidatePath(`/event/${eventId}/breakouts/${toGroupId}`)
    revalidatePath(`/event/${eventId}/registrants`)
    revalidatePath(`/event/${eventId}/catch-mech`)
    // Session detail renders each group's capacity, so a move shifts numbers
    // there too. The occurrence id isn't known here — revalidate the segment.
    revalidatePath(`/event/${eventId}/sessions`, "layout")

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to transfer registrant" }
  }
}

// ─── Facilitator assignment ───────────────────────────────────────────────────

// ─── Auto-assign on check-in ─────────────────────────────────────────────────

/**
 * Called after a registrant checks in to an occurrence.
 * Silently assigns them to the best-matching breakout group if they're not
 * already assigned to one. Never throws — failures are swallowed so they
 * never block the check-in flow.
 *
 * Deliberately unguarded: the public check-in page (`/events/[id]/checkin`)
 * calls this with no session. Same for `getRegistrantBreakoutGroupName` below.
 */
export async function autoAssignRegistrantToBreakout(
  registrantId: string,
  eventId: string
): Promise<void> {
  try {
    const alreadyAssigned = await db.breakoutGroupMember.findFirst({
      where: { registrantId, breakoutGroup: { eventId } },
      select: { breakoutGroupId: true },
    })
    if (alreadyAssigned) return

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { memberId: true },
    })
    if (registrant?.memberId) {
      const isFacilitator = await db.breakoutGroup.findFirst({
        where: {
          eventId,
          OR: [
            { facilitator: { memberId: registrant.memberId } },
            { coFacilitator: { memberId: registrant.memberId } },
          ],
        },
        select: { id: true },
      })
      if (isFacilitator) return
    }

    const matches = await matchBreakoutGroups(registrantId, eventId, {
      excludeAssigned: true,
      limit: 1,
    })
    if (matches.length === 0) return

    const topMatch = matches[0]

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: topMatch.groupId, registrantId },
    })
    await tryCreateSmallGroupRequestFromBreakout(topMatch.groupId, registrantId)

    revalidatePath(`/event/${eventId}/breakouts`)
  } catch {
    // Swallow — auto-assign is best-effort and must not interrupt check-in
  }
}

/**
 * Reads a registrant's current breakout group assignment for an event.
 * Used by the public check-in success screen to show the person which breakout
 * group they belong to. Best-effort — returns null when unassigned or on error.
 */
export async function getRegistrantBreakoutGroupName(
  registrantId: string,
  eventId: string
): Promise<{ name: string } | null> {
  try {
    const membership = await db.breakoutGroupMember.findFirst({
      where: { registrantId, breakoutGroup: { eventId } },
      select: { breakoutGroup: { select: { name: true } } },
    })
    return membership ? { name: membership.breakoutGroup.name } : null
  } catch {
    return null
  }
}

// ─── Auto-assign ─────────────────────────────────────────────────────────────

export async function autoAssignBreakouts(
  eventId: string
): Promise<ActionResult<{ assigned: number; skipped: number }>> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    const unassigned = await db.eventRegistrant.findMany({
      where: { eventId, ...unassignedCandidateWhere(eventId) },
      select: { id: true },
    })

    if (unassigned.length === 0) {
      return { success: true, data: { assigned: 0, skipped: 0 } }
    }

    let assigned = 0
    let skipped = 0

    for (const { id: registrantId } of unassigned) {
      const matches = await matchBreakoutGroups(registrantId, eventId, {
        excludeAssigned: true,
        limit: 1,
      })

      if (matches.length === 0) {
        skipped++
        continue
      }

      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: matches[0].groupId, registrantId },
      })
      await tryCreateSmallGroupRequestFromBreakout(matches[0].groupId, registrantId)
      assigned++
    }

    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: { assigned, skipped } }
  } catch {
    return { success: false, error: "Failed to auto-assign registrants" }
  }
}

// ─── Facilitator assignment ───────────────────────────────────────────────────

/**
 * Assign or clear one of a breakout group's two facilitator slots.
 *
 * This deliberately does **not** touch the matching profile. It used to copy the
 * facilitator's linked DGroup criteria over the group's own, which meant a
 * facilitator change silently rewrote what the group matched for and made the
 * profile read-only in both edit drawers. A breakout table is not its
 * facilitator's DGroup — the criteria are the group's, hand-entered and always
 * editable.
 *
 * `linkedSmallGroupId` still travels with a facilitator change, but only as
 * Catch Mech routing: it decides which DGroup receives this group's member
 * requests (`resolveLinkedSmallGroup`). Absent means "not submitted", not
 * "clear it".
 */
export async function setFacilitator(
  groupId: string,
  volunteerId: string | null,
  role: "facilitator" | "coFacilitator",
  eventId: string,
  linkedSmallGroupId?: string | null
): Promise<ActionResult> {
  const denied = await requireEventWrite(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    if (volunteerId !== null) {
      const volunteer = await db.volunteer.findFirst({
        where: { id: volunteerId, eventId },
        select: { id: true },
      })
      if (!volunteer) {
        return { success: false, error: "Volunteer not found for this event" }
      }
      const group = await db.breakoutGroup.findUnique({
        where: { id: groupId },
        select: { facilitatorId: true, coFacilitatorId: true },
      })
      if (!group) return { success: false, error: "Breakout group not found" }
      const otherSlot = role === "facilitator" ? group.coFacilitatorId : group.facilitatorId
      if (otherSlot === volunteerId) {
        return {
          success: false,
          error: "Facilitator and co-facilitator must be different volunteers",
        }
      }
    }

    // Unassigning the facilitator takes the group's matching profile and Catch
    // Mech target with it — a table nobody runs matches for nothing. Only this
    // slot: the co-facilitator is a second pair of hands, not the owner, and a
    // swap between two facilitators leaves the criteria untouched.
    const unlinked = role === "facilitator" && volunteerId === null

    await db.breakoutGroup.update({
      where: { id: groupId },
      data: role === "facilitator"
        ? unlinked
          ? { facilitatorId: null, linkedSmallGroupId: null, ...clearedMatchingProfile() }
          : {
              facilitatorId: volunteerId,
              ...(linkedSmallGroupId !== undefined ? { linkedSmallGroupId } : {}),
            }
        : { coFacilitatorId: volunteerId },
    })
    revalidatePath(`/event/${eventId}/breakouts/${groupId}`)
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update facilitator" }
  }
}
