/**
 * The database half of Catch Mech confirmations, shared by every surface — the
 * faci form, the Timothy group-creation step, and the volunteer follow-up form.
 *
 * These live here rather than in a route's `actions.ts` on purpose. Everything
 * exported from a `"use server"` file becomes a publicly callable endpoint, so
 * `prefetchRegistrantData` sitting there meant anyone could POST registrant ids
 * and read back guest emails, phones and notes without authenticating. They are
 * internal helpers, not actions: the callers are already server-side.
 *
 * Server-only — this module imports `@/lib/db`. The decision shapes and the pure
 * validate/resolve rules live in `./decisions.ts` so client surfaces can reach
 * them without pulling Prisma into the browser bundle.
 */

import type { DeclineReason, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { repointFamilyLinksBatch } from "@/lib/family-links"
import { PROMOTABLE_GUEST_SELECT, buildPromotedMemberData } from "@/lib/people/promote-guest"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import type { ConfirmDecision, ResolvedDecision } from "@/lib/catch-mech/decisions"

// ─── Pre-fetch registrant data in bulk (outside transaction) ─────────────────

const registrantSelect = {
  id: true,
  memberId: true,
  guestId: true,
  member: { select: { firstName: true, lastName: true, smallGroupId: true } },
  guest: { select: PROMOTABLE_GUEST_SELECT },
} satisfies Prisma.EventRegistrantSelect

export type FetchedRegistrant = Prisma.EventRegistrantGetPayload<{
  select: typeof registrantSelect
}>

export async function prefetchRegistrantData(decisions: ConfirmDecision[]): Promise<{
  registrantMap: Map<string, FetchedRegistrant>
  takenEmails: Set<string>
}> {
  const ids = decisions.map((d) => d.registrantId)

  const registrants = await db.eventRegistrant.findMany({
    where: { id: { in: ids } },
    select: registrantSelect,
  })

  const registrantMap = new Map(registrants.map((r) => [r.id, r]))

  // Collect all guest emails that need a uniqueness check
  const guestEmails = registrants
    .filter((r) => r.guest?.email)
    .map((r) => r.guest!.email!)

  let takenEmails = new Set<string>()
  if (guestEmails.length > 0) {
    const existing = await db.member.findMany({
      where: { email: { in: guestEmails } },
      select: { email: true },
    })
    takenEmails = new Set(existing.map((m) => m.email!))
  }

  return { registrantMap, takenEmails }
}


// ─── Shared confirmation resolver (writes only — reads pre-fetched) ───────────

/**
 * Applies a facilitator's confirms and declines.
 *
 * Shaped around round trips, not readability-per-person: this runs inside an
 * interactive transaction while a faci waits on a phone, and it used to issue
 * seven-to-nine sequential queries for every person on the table — a group of
 * ten held a connection open for dozens of serial round trips to Neon. Requests,
 * family links, logs and new request rows are now read and written once for the
 * whole batch; only the writes carrying a per-person value (creating the Member,
 * pointing the Guest and its registrations at it, resolving that person's own
 * request) still run individually, because Prisma cannot express one statement
 * with a different value per row.
 */
export async function resolveConfirmations(
  breakoutGroupId: string | null,
  faciVolunteerId: string | null,
  decisions: ResolvedDecision[],
  registrantMap: Map<string, FetchedRegistrant>,
  takenEmails: Set<string>,
  tx: Prisma.TransactionClient,
  eventName: string | null,
  /** The faci's Member — public flow has no User, so this is the only attribution. */
  actorMemberId: string | null,
  sourceLabel: string
): Promise<void> {
  const now = new Date()
  const suffix = `${sourceLabel}${eventName ? ` of ${eventName}` : ""}`

  // Only written when there is one. The volunteer follow-up flow passes null (a
  // volunteer has no breakout table), and a blind `breakoutGroupId: null` on an
  // update would erase the link on a request that a breakout raised — dropping
  // that person out of every breakout-scoped screen. New rows still take the
  // null; there is nothing to preserve there.
  const breakoutLink = breakoutGroupId ? { breakoutGroupId } : {}

  type Actionable = {
    registrant: FetchedRegistrant
    smallGroupId: string
    declineReason?: DeclineReason
    reason?: string
  }

  // ── Partition ──────────────────────────────────────────────────────────────
  // Deduped by person, not by registrant: promoting a guest repoints *all* their
  // registrations onto the new Member, so a second decision for the same person
  // in one batch would read a now-stale prefetched row and create a second Member.
  const seen = new Set<string>()
  const declines: Actionable[] = []
  const guestConfirms: Actionable[] = []
  const memberConfirms: Actionable[] = []

  for (const { registrantId, status, declineReason, reason, groupId } of decisions) {
    const registrant = registrantMap.get(registrantId)
    if (!registrant) continue
    if (!registrant.memberId && !registrant.guestId) continue
    // "pending" — leave as-is, no DB update
    if (status === "pending") continue
    // Callers resolve a group for every confirm/decline they route here; a groupless
    // decline goes through persistGrouplessDeclines instead.
    if (!groupId) continue

    const personKey = registrant.memberId ? `m:${registrant.memberId}` : `g:${registrant.guestId}`
    if (seen.has(personKey)) continue
    seen.add(personKey)

    const entry: Actionable = { registrant, smallGroupId: groupId, declineReason, reason }
    if (status === "declined") {
      declines.push(entry)
    } else if (registrant.guestId && registrant.guest && !registrant.guest.memberId) {
      guestConfirms.push(entry)
    } else if (registrant.memberId && registrant.member) {
      // A member belongs to at most one group — never re-confirm someone already
      // placed (here or in another group) into a different one.
      if (registrant.member.smallGroupId) continue
      memberConfirms.push(entry)
    }
  }

  const all = [...declines, ...guestConfirms, ...memberConfirms]
  if (all.length === 0) return

  // ── One read for every pending request this batch could resolve ────────────
  const guestIds = all.map((a) => a.registrant.guestId).filter((id): id is string => !!id)
  const memberIds = all.map((a) => a.registrant.memberId).filter((id): id is string => !!id)
  const groupIds = [...new Set(all.map((a) => a.smallGroupId))]

  const pendingRequests = await tx.smallGroupMemberRequest.findMany({
    where: {
      status: "Pending",
      smallGroupId: { in: groupIds },
      OR: [
        ...(guestIds.length > 0 ? [{ guestId: { in: guestIds } }] : []),
        ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
      ],
    },
    select: { id: true, guestId: true, memberId: true, smallGroupId: true },
  })

  /** Pending request ids for one person in one group — usually zero or one. */
  const requestsFor = (a: Actionable): string[] => {
    const key = a.registrant.memberId
      ? `m:${a.registrant.memberId}`
      : `g:${a.registrant.guestId}`
    return pendingRequests
      .filter(
        (r) =>
          r.smallGroupId === a.smallGroupId &&
          (r.memberId ? `m:${r.memberId}` : `g:${r.guestId}`) === key
      )
      .map((r) => r.id)
  }

  const personName = (r: FetchedRegistrant) =>
    r.member
      ? `${r.member.firstName} ${r.member.lastName}`
      : r.guest
        ? `${r.guest.firstName} ${r.guest.lastName}`
        : "Unknown"

  // Accumulated and flushed once at the end — pure inserts with no id to read back.
  const logs: Prisma.SmallGroupLogCreateManyInput[] = []
  const newRequests: Prisma.SmallGroupMemberRequestCreateManyInput[] = []
  const schedules: Prisma.SchedulePreferenceCreateManyInput[] = []
  const familyRepoints: { from: { guestId: string }; to: { memberId: string } }[] = []

  // ── Declines ───────────────────────────────────────────────────────────────
  // Grouped by payload so a table declining for the same reason is one statement.
  const declineUpdates = new Map<string, { ids: string[]; declineReason?: DeclineReason; reason?: string }>()

  for (const a of declines) {
    const { registrant } = a
    const existing = requestsFor(a)
    if (existing.length > 0) {
      const key = `${a.declineReason ?? ""}|${a.reason ?? ""}`
      const bucket = declineUpdates.get(key)
      // Only the first matching request was resolved before; keep that behaviour.
      if (bucket) bucket.ids.push(existing[0])
      else declineUpdates.set(key, { ids: [existing[0]], declineReason: a.declineReason, reason: a.reason })
    } else {
      // No pre-existing request (e.g. Timothy's group didn't exist yet at assignment time)
      newRequests.push({
        smallGroupId: a.smallGroupId,
        breakoutGroupId,
        declinedByVolunteerId: faciVolunteerId,
        status: "Rejected",
        resolvedAt: now,
        declineReason: a.declineReason ?? null,
        notes: a.reason ?? null,
        ...(registrant.memberId
          ? { memberId: registrant.memberId }
          : { guestId: registrant.guestId! }),
      })
    }
    logs.push({
      smallGroupId: a.smallGroupId,
      action: "TempAssignmentRejected",
      guestId: registrant.guestId ?? null,
      memberId: registrant.memberId ?? null,
      performedByMemberId: actorMemberId,
      description: `${personName(registrant)}'s membership was declined via ${suffix}`,
    })
  }

  for (const { ids, declineReason, reason } of declineUpdates.values()) {
    await tx.smallGroupMemberRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "Rejected",
        resolvedAt: now,
        ...breakoutLink,
        declinedByVolunteerId: faciVolunteerId,
        declineReason: declineReason ?? null,
        notes: reason ?? null,
      },
    })
  }

  // ── Confirmed guests → promote to Member ───────────────────────────────────
  for (const a of guestConfirms) {
    const { registrant } = a
    const guest = registrant.guest!
    const guestId = registrant.guestId!
    // No capacity gate here: a facilitator's explicit confirmation always wins.
    // memberLimit is a soft target that steers auto-matching suggestions, never a
    // hard wall — silently dropping a confirmed person (no member, no request, no
    // error) left them stuck on the form with the status never transitioning.
    //
    // Only the field copy is shared with the other promotion sites, not
    // `promoteGuestRecord`: this loop's whole point is one statement per table for
    // the batch, and the helper's nested schedule create would put the per-guest
    // round trip back. An email already taken by another Member is dropped rather
    // than reused — a faci confirming a table shouldn't silently merge two people.
    const { data, schedule } = buildPromotedMemberData(guest, {
      dateJoined: now,
      groupId: a.smallGroupId,
      email: guest.email && takenEmails.has(guest.email) ? null : (guest.email ?? null),
      schedule: "raw",
    })
    const newMember = await tx.member.create({ data, select: { id: true } })

    // Lifted out of the create above: as a nested write it cost a second round
    // trip per guest, and one createMany covers the whole table instead.
    if (schedule) {
      schedules.push({
        memberId: newMember.id,
        dayOfWeek: schedule.dayOfWeek,
        timeStart: schedule.timeStart,
        timeEnd: schedule.timeEnd,
      })
    }

    await tx.guest.update({ where: { id: guestId }, data: { memberId: newMember.id } })
    await tx.eventRegistrant.updateMany({
      where: { guestId },
      data: { memberId: newMember.id, guestId: null },
    })
    familyRepoints.push({ from: { guestId }, to: { memberId: newMember.id } })

    logs.push({
      smallGroupId: a.smallGroupId,
      action: "MemberAdded",
      memberId: newMember.id,
      performedByMemberId: actorMemberId,
      description: `${guest.firstName} ${guest.lastName} confirmed via ${suffix} and joined the group`,
    })

    const existing = requestsFor(a)
    if (existing.length > 0) {
      await tx.smallGroupMemberRequest.updateMany({
        where: { id: { in: existing } },
        data: {
          status: "Confirmed",
          resolvedAt: now,
          memberId: newMember.id,
          guestId: null,
          ...breakoutLink,
        },
      })
    } else {
      // No pre-existing request — create a confirmed record so the admin page tracks it
      newRequests.push({
        smallGroupId: a.smallGroupId,
        breakoutGroupId,
        memberId: newMember.id,
        status: "Confirmed",
        resolvedAt: now,
      })
    }
  }

  // ── Confirmed existing members → just place them ───────────────────────────
  const memberPlacements = new Map<string, string[]>()
  for (const a of memberConfirms) {
    const memberId = a.registrant.memberId!
    const bucket = memberPlacements.get(a.smallGroupId)
    if (bucket) bucket.push(memberId)
    else memberPlacements.set(a.smallGroupId, [memberId])

    logs.push({
      smallGroupId: a.smallGroupId,
      action: "MemberAdded",
      memberId,
      performedByMemberId: actorMemberId,
      description: `${personName(a.registrant)} confirmed via ${suffix} and joined the group`,
    })

    const existing = requestsFor(a)
    if (existing.length > 0) {
      await tx.smallGroupMemberRequest.updateMany({
        where: { id: { in: existing } },
        data: { status: "Confirmed", resolvedAt: now, ...breakoutLink },
      })
    } else {
      // No pre-existing request — create a confirmed record so the admin page tracks it
      newRequests.push({
        smallGroupId: a.smallGroupId,
        breakoutGroupId,
        memberId,
        status: "Confirmed",
        resolvedAt: now,
      })
    }
  }

  // Everyone landing in the same group shares one update.
  for (const [smallGroupId, ids] of memberPlacements) {
    await tx.member.updateMany({
      where: { id: { in: ids } },
      data: { smallGroupId, groupStatus: "Member" },
    })
  }

  // A confirmed leader now has a DGroup here, which supersedes any satellite
  // they had declared as their upward accountability.
  await clearUpwardSatelliteOnConfirm(tx, [...memberPlacements.values()].flat())

  // ── Flush the batched work ─────────────────────────────────────────────────
  await repointFamilyLinksBatch(tx, familyRepoints)
  if (schedules.length > 0) {
    await tx.schedulePreference.createMany({ data: schedules })
  }
  if (newRequests.length > 0) {
    await tx.smallGroupMemberRequest.createMany({ data: newRequests })
  }
  if (logs.length > 0) {
    await tx.smallGroupLog.createMany({ data: logs })
  }
}
