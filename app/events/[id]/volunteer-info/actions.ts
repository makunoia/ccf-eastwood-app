"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { formatPhilippinePhone } from "@/lib/utils"
import { volunteerInfoSchema, type VolunteerIdentity, type VolunteerInfoInput } from "./types"
import {
  memberGroupStatusFor,
  newGroupStatusFor,
  resolveEffectiveLeadership,
  shouldActivateGroup,
} from "@/lib/volunteers/leadership"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Identity lookup ──────────────────────────────────────────────────────────

export async function lookupVolunteer(
  eventId: string,
  phone: string
): Promise<ActionResult<VolunteerIdentity>> {
  if (!phone.trim()) {
    return { success: false, error: "Mobile number is required" }
  }

  const member = await db.member.findFirst({
    where: { phone: formatPhilippinePhone(phone.trim()) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      groupStatus: true,
      schedulePreferences: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
        orderBy: { createdAt: "asc" },
      },
      ledGroups: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          lifeStages: { select: { id: true } },
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
        },
      },
    },
  })

  if (!member) {
    return { success: false, error: "No member found with that mobile number" }
  }

  const volunteer = await db.volunteer.findFirst({
    where: { eventId, memberId: member.id },
    select: { id: true },
  })

  if (!volunteer) {
    return {
      success: false,
      error: "You are not registered as a volunteer for this event",
    }
  }

  return {
    success: true,
    data: {
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      groupStatus: member.groupStatus,
      schedulePreferences: member.schedulePreferences,
      ledGroups: member.ledGroups.map((g) => {
        const { lifeStages, ...rest } = g
        return { ...rest, lifeStageIds: lifeStages.map((ls) => ls.id) }
      }),
    },
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function submitVolunteerInfo(
  input: VolunteerInfoInput
): Promise<ActionResult> {
  const parsed = volunteerInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: "Invalid form data" }
  }

  const { memberId, eventId, firstName, lastName, email, phone, leadershipStatus, groupId, groupFields } =
    parsed.data

  // Resolve which led group the groupFields apply to. An explicit groupId must
  // belong to this member; without one, fall back to their oldest led group.
  const targetGroup =
    (leadershipStatus === "leader" || leadershipStatus === "timothy") && groupFields
      ? groupId
        ? await db.smallGroup.findFirst({
            where: { id: groupId, leaderId: memberId },
            select: { id: true, status: true },
          })
        : await db.smallGroup.findFirst({
            where: { leaderId: memberId },
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true },
          })
      : null
  if (groupId && groupFields && leadershipStatus !== "none" && !targetGroup) {
    return { success: false, error: "Group not found" }
  }

  // A group that is already Active proves real leadership, so a "timothy"
  // submission against one is a promotion, not a demotion.
  const leadership = resolveEffectiveLeadership(leadershipStatus, targetGroup?.status ?? null)

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { name: true },
    })

    const changes: string[] = []

    await db.$transaction(async (tx) => {
      const newGroupStatus = memberGroupStatusFor(leadership)

      // ── SmallGroup create/update (leader and Timothy both) ──────────────────
      if ((leadership === "leader" || leadership === "timothy") && groupFields) {
        const existing = targetGroup

        const groupData = {
          name: groupFields.name,
          genderFocus: groupFields.genderFocus,
          language: groupFields.language,
          ageRangeMin: groupFields.ageRangeMin,
          ageRangeMax: groupFields.ageRangeMax,
          meetingFormat: groupFields.meetingFormat,
          locationCity: groupFields.locationCity,
          memberLimit: groupFields.memberLimit,
          scheduleDayOfWeek: groupFields.scheduleDayOfWeek,
          scheduleTimeStart: groupFields.scheduleTimeStart,
          scheduleTimeEnd: groupFields.scheduleTimeEnd,
        }
        const lifeStageConnect = groupFields.lifeStageIds.map((id) => ({ id }))

        if (existing) {
          // Claiming leadership over a group that was pre-created as an intended
          // group brings it live.
          const activate = shouldActivateGroup(leadership, existing.status)
          await tx.smallGroup.update({
            where: { id: existing.id },
            data: {
              ...groupData,
              lifeStages: { set: lifeStageConnect },
              ...(activate ? { status: "Active" as const } : {}),
            },
          })
          // No SmallGroupLog row here on purpose: the enum has no "activated"
          // action and the group already owns a GroupCreated entry. The
          // activation is recorded on the MemberLog via `changes` below.
          changes.push(
            activate
              ? `Activated group: "${groupFields.name}"`
              : `Updated group: "${groupFields.name}"`
          )
        } else {
          // Leaders get Active immediately; Timothy gets Pending until first member
          const status = newGroupStatusFor(leadership)
          const created = await tx.smallGroup.create({
            data: { ...groupData, leaderId: memberId, status, lifeStages: { connect: lifeStageConnect } },
            select: { id: true },
          })
          await tx.smallGroupLog.create({
            data: {
              smallGroupId: created.id,
              action: "GroupCreated",
              description:
                leadership === "timothy"
                  ? `Group "${groupFields.name}" prepared via volunteer info form (${event?.name ?? eventId}) — pending first member`
                  : `Group "${groupFields.name}" created via volunteer info form (${event?.name ?? eventId})`,
            },
          })
          changes.push(
            leadership === "timothy"
              ? `Prepared group: "${groupFields.name}" (pending first member)`
              : `Created group: "${groupFields.name}"`
          )
        }

        // Propagate schedule to Member.schedulePreferences
        if (groupFields.scheduleDayOfWeek != null && groupFields.scheduleTimeStart) {
          await tx.schedulePreference.deleteMany({ where: { memberId } })
          await tx.schedulePreference.create({
            data: {
              memberId,
              dayOfWeek: groupFields.scheduleDayOfWeek,
              timeStart: groupFields.scheduleTimeStart,
              timeEnd: groupFields.scheduleTimeEnd ?? null,
            },
          })
        }
      }

      // ── Update Member ───────────────────────────────────────────────────────
      await tx.member.update({
        where: { id: memberId },
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email?.trim() || null,
          phone: formatPhilippinePhone(phone.trim()),
          // null only when leadership is "none" — never demote on a bare
          // personal-info save.
          ...(newGroupStatus ? { groupStatus: newGroupStatus } : {}),
        },
      })

      // ── Write MemberLog ─────────────────────────────────────────────────────
      const description =
        changes.length > 0
          ? `Updated via volunteer info form — ${changes.join("; ")}`
          : "Updated personal info via volunteer info form"

      await tx.memberLog.create({
        data: {
          memberId,
          action: "VolunteerInfoUpdated",
          description: `${event?.name ?? "an event"}: ${description}`,
          eventId,
        },
      })
    })

    revalidatePath(`/members/${memberId}`)
    revalidatePath(`/small-groups`)

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[submitVolunteerInfo]", err)
    return { success: false, error: "Failed to save your information. Please try again." }
  }
}
