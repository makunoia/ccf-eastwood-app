"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { volunteerInfoSchema, type VolunteerIdentity, type VolunteerInfoInput } from "./types"

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
    where: { phone: phone.trim() },
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
          lifeStageId: true,
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
      ledGroups: member.ledGroups,
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

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { name: true },
    })

    const changes: string[] = []

    await db.$transaction(async (tx) => {
      const newGroupStatus =
        leadershipStatus === "leader" ? "Leader"
        : leadershipStatus === "timothy" ? "Timothy"
        : null

      // ── SmallGroup create/update (leader and Timothy both) ──────────────────
      if ((leadershipStatus === "leader" || leadershipStatus === "timothy") && groupFields) {
        const existing = targetGroup

        const groupData = {
          name: groupFields.name,
          lifeStageId: groupFields.lifeStageId,
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

        if (existing) {
          await tx.smallGroup.update({
            where: { id: existing.id },
            data: groupData,
          })
          changes.push(`Updated group: "${groupFields.name}"`)
        } else {
          // Leaders get Active immediately; Timothy gets Pending until first member
          const status = leadershipStatus === "leader" ? "Active" : "Pending"
          const created = await tx.smallGroup.create({
            data: { ...groupData, leaderId: memberId, status },
            select: { id: true },
          })
          await tx.smallGroupLog.create({
            data: {
              smallGroupId: created.id,
              action: "GroupCreated",
              description:
                leadershipStatus === "timothy"
                  ? `Group "${groupFields.name}" prepared via volunteer info form (${event?.name ?? eventId}) — pending first member`
                  : `Group "${groupFields.name}" created via volunteer info form (${event?.name ?? eventId})`,
            },
          })
          changes.push(
            leadershipStatus === "timothy"
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
          phone: phone.trim(),
          ...(leadershipStatus !== "none" ? { groupStatus: newGroupStatus } : {}),
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
