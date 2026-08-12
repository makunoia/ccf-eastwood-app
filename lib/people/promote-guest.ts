/**
 * The one place that knows how to turn a Guest into a Member.
 *
 * Four call sites promote guests — the admin action, the leader-confirmation
 * token flow, the Catch Mech faci form, and the couples confirmation — and each
 * used to hand-copy the Guest field list onto `member.create`. They drifted, as
 * hand-copied lists do: `ageRangeBucketId` went missing from all four (CCF-123)
 * and `nickname` from three. Centralising the copy is the fix; the schema-parity
 * guard in `tests/tickets/ccf-123-promotion.test.ts` keeps it honest as columns
 * are added.
 *
 * Deliberately NOT a `"use server"` module: three of the four callers are public
 * token flows, and everything exported from a `"use server"` file is a callable
 * endpoint. These are internal helpers — the callers are already server-side.
 *
 * What stays with the callers, and why:
 * - permission checks — three callers authenticate by token, not session
 * - `checkDuplicateContactInfo` — an admin-UX gate, not an invariant; the public
 *   flows deliberately resolve collisions by reusing or dropping the email
 * - capacity — the three policies genuinely differ (hard reject / skip / couples
 *   seat math), so `assertGroupCapacity` is offered separately rather than baked in
 * - `SmallGroupLog` and `SmallGroupMemberRequest` writes — per-site wording, actor
 *   attribution, and batching
 * - `revalidatePath` — a request-scope concern; this runs inside a transaction
 */

import type { Prisma, SmallGroupStatus } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { buildStoredScheduleSlot } from "@/lib/matching/candidate-schedule"
import { repointFamilyLinks } from "@/lib/family-links"

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * Every Guest column a promotion reads. Callers select exactly this so a new
 * column can't be copied by one site and silently dropped by another.
 */
export const PROMOTABLE_GUEST_SELECT = {
  memberId: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  phone: true,
  notes: true,
  lifeStageId: true,
  ageRangeBucketId: true,
  gender: true,
  language: true,
  birthMonth: true,
  birthYear: true,
  workCity: true,
  workIndustry: true,
  meetingPreference: true,
  scheduleDayOfWeek: true,
  scheduleTimeStart: true,
  scheduleTimeEnd: true,
} satisfies Prisma.GuestSelect

export type PromotableGuest = Prisma.GuestGetPayload<{
  select: typeof PROMOTABLE_GUEST_SELECT
}>

export type PromotedSchedule = {
  dayOfWeek: number
  timeStart: string
  timeEnd: string | null
}

/**
 * How a Guest's single availability slot becomes a Member `SchedulePreference`.
 *
 * - `"raw"` writes what the guest actually gave us, `timeEnd` included as-is. The
 *   admin path uses this: an admin who left the end time blank meant blank.
 * - `"normalized"` runs `buildStoredScheduleSlot`, widening a day-only answer into
 *   a whole-day slot and a start-only answer into one hour. The public flows use
 *   this because their guests answer with a day and nothing else, and dropping the
 *   day would lose the only schedule signal they gave.
 *
 * The two are kept apart on purpose — unifying them is a behaviour change with its
 * own test churn, not part of centralising the field copy.
 */
export type SchedulePolicy = "raw" | "normalized"

export type BuildPromotedMemberOptions = {
  /** Required — `Member.dateJoined` has no default. */
  dateJoined: Date
  /** Omit or pass null to promote without placing them in a DGroup. */
  groupId?: string | null
  /**
   * Overrides the guest's email. The batched Catch Mech path passes `null` to drop
   * an address already taken by another Member (`Member.email` is unique, the
   * Guest one is not).
   */
  email?: string | null
  schedule?: SchedulePolicy
}

/**
 * Pure — no DB. Builds the `member.create` payload and resolves the schedule slot,
 * but returns the slot *separately* rather than nesting it: the batched Catch Mech
 * path deliberately collects schedules into one `createMany` instead of paying a
 * round trip per guest, and a nested create would put that back.
 */
export function buildPromotedMemberData(
  guest: PromotableGuest,
  opts: BuildPromotedMemberOptions
): { data: Prisma.MemberUncheckedCreateInput; schedule: PromotedSchedule | null } {
  const groupId = opts.groupId ?? null
  const email = opts.email !== undefined ? opts.email : (guest.email ?? null)

  const schedule: PromotedSchedule | null =
    opts.schedule === "normalized"
      ? buildStoredScheduleSlot(
          guest.scheduleDayOfWeek,
          guest.scheduleTimeStart,
          guest.scheduleTimeEnd
        )
      : guest.scheduleDayOfWeek !== null && guest.scheduleTimeStart !== null
        ? {
            dayOfWeek: guest.scheduleDayOfWeek,
            timeStart: guest.scheduleTimeStart,
            timeEnd: guest.scheduleTimeEnd ?? null,
          }
        : null

  return {
    data: {
      firstName: guest.firstName,
      lastName: guest.lastName,
      nickname: guest.nickname ?? null,
      email,
      phone: guest.phone ?? null,
      notes: guest.notes ?? null,
      lifeStageId: guest.lifeStageId ?? null,
      gender: guest.gender ?? null,
      language: guest.language,
      birthMonth: guest.birthMonth ?? null,
      birthYear: guest.birthYear ?? null,
      workCity: guest.workCity ?? null,
      workIndustry: guest.workIndustry ?? null,
      // Carried over so a bracket collected at registration survives promotion.
      ageRangeBucketId: guest.ageRangeBucketId ?? null,
      meetingPreference: guest.meetingPreference ?? null,
      dateJoined: opts.dateJoined,
      // No group is a real state, not a missing value: a member can exist without
      // a DGroup, and `groupStatus` is documented as null when they aren't in one.
      smallGroupId: groupId,
      groupStatus: groupId ? "Member" : null,
    },
    schedule,
  }
}

export type PromoteGuestRecordArgs = {
  guestId: string
  guest: PromotableGuest
  dateJoined: Date
  /** Omit to promote without a DGroup. Pass `status` so a Pending group can be woken. */
  group?: { id: string; status: SmallGroupStatus } | null
  /**
   * When the guest's email already belongs to a Member, move that Member into the
   * group instead of creating a second one. The public token flows want this (they
   * would otherwise hit P2002 mid-confirmation); the admin path does not — silently
   * merging two people is worse than an error the admin can see.
   */
  reuseExistingMemberByEmail?: boolean
  schedule?: SchedulePolicy
}

/**
 * The full promotion, inside a transaction the caller owns: create (or reuse) the
 * Member, link the Guest to it, and carry every reference across — event
 * registrations and family links — so nothing still points at the guest identity.
 *
 * The Guest row itself is kept, not deleted: it is the historical record of how
 * this person first appeared.
 */
export async function promoteGuestRecord(
  tx: TxClient,
  args: PromoteGuestRecordArgs
): Promise<{ memberId: string; reusedExistingMember: boolean }> {
  const { guestId, guest, dateJoined, group = null, schedule = "raw" } = args
  const groupId = group?.id ?? null

  const existingByEmail =
    args.reuseExistingMemberByEmail && guest.email
      ? await tx.member.findUnique({ where: { email: guest.email }, select: { id: true } })
      : null

  let memberId: string

  if (existingByEmail) {
    memberId = existingByEmail.id
    if (groupId) {
      await tx.member.update({
        where: { id: memberId },
        data: { smallGroupId: groupId, groupStatus: "Member" },
      })
    }
  } else {
    const built = buildPromotedMemberData(guest, { dateJoined, groupId, schedule })
    const created = await tx.member.create({
      data: {
        ...built.data,
        ...(built.schedule
          ? {
              schedulePreferences: {
                create: {
                  dayOfWeek: built.schedule.dayOfWeek,
                  timeStart: built.schedule.timeStart,
                  timeEnd: built.schedule.timeEnd,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    })
    memberId = created.id
  }

  await tx.guest.update({ where: { id: guestId }, data: { memberId } })
  await tx.eventRegistrant.updateMany({
    where: { guestId },
    data: { memberId, guestId: null },
  })
  await repointFamilyLinks(tx, { guestId }, { memberId })

  // A group's first confirmed member is what makes it real.
  if (group?.status === "Pending") {
    await tx.smallGroup.update({ where: { id: group.id }, data: { status: "Active" } })
  }

  return { memberId, reusedExistingMember: existingByEmail !== null }
}

/**
 * Returns an error message when the group can't seat `seats` more people, or null
 * when it can. Offered separately because the callers disagree about whether a
 * full group should block: the admin path rejects, the faci form overrides.
 */
export async function assertGroupCapacity(
  tx: TxClient,
  groupId: string,
  seats = 1
): Promise<string | null> {
  const group = await tx.smallGroup.findUnique({
    where: { id: groupId },
    select: { memberLimit: true, _count: { select: { members: true } } },
  })
  if (!group) return "DGroup not found"
  if (group.memberLimit !== null && group._count.members + seats > group.memberLimit) {
    return `This group has reached its member limit of ${group.memberLimit}`
  }
  return null
}
