"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

type Decision = { requestId: string; confirmed: boolean }

export async function submitMemberConfirmations(
  token: string,
  decisions: Decision[]
): Promise<ActionResult> {
  const group = await db.smallGroup.findUnique({
    where: { leaderConfirmationToken: token },
    select: { id: true, name: true },
  })
  if (!group) {
    return { success: false, error: "Confirmation link not found or has expired." }
  }

  if (!decisions.length) {
    return { success: false, error: "No decisions provided." }
  }

  try {
    const affectedGuestIds = new Set<string>()

    await db.$transaction(async (tx) => {
      for (const { requestId, confirmed } of decisions) {
        const req = await tx.smallGroupMemberRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            smallGroupId: true,
            guestId: true,
            memberId: true,
            fromGroupId: true,
            status: true,
            guest: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                notes: true,
                lifeStageId: true,
                gender: true,
                language: true,
                birthMonth: true,
                birthYear: true,
                workCity: true,
                workIndustry: true,
                meetingPreference: true,
                scheduleDayOfWeek: true,
                scheduleTimeStart: true,
                memberId: true,
              },
            },
            member: { select: { firstName: true, lastName: true } },
          },
        })

        if (!req || req.status !== "Pending" || req.smallGroupId !== group.id) continue

        if (req.guestId) {
          affectedGuestIds.add(req.guestId)
        }

        const now = new Date()
        const resolvedStatus = confirmed ? "Confirmed" : "Rejected"

        if (confirmed) {
          if (req.guestId && req.guest) {
            const guest = req.guest
            // Skip if already promoted
            if (!guest.memberId) {
              // Check capacity
              const sg = await tx.smallGroup.findUnique({
                where: { id: group.id },
                select: { memberLimit: true, _count: { select: { members: true } } },
              })
              if (sg?.memberLimit !== null && sg!._count.members >= sg!.memberLimit!) {
                // Skip — group is full; leave request pending
                continue
              }

              const newMember = await tx.member.create({
                data: {
                  firstName: guest.firstName,
                  lastName: guest.lastName,
                  email: guest.email ?? null,
                  phone: guest.phone ?? null,
                  notes: guest.notes ?? null,
                  lifeStageId: guest.lifeStageId ?? null,
                  gender: guest.gender ?? null,
                  language: guest.language,
                  birthMonth: guest.birthMonth ?? null,
                  birthYear: guest.birthYear ?? null,
                  workCity: guest.workCity ?? null,
                  workIndustry: guest.workIndustry ?? null,
                  meetingPreference: guest.meetingPreference ?? null,
                  dateJoined: now,
                  smallGroupId: group.id,
                  groupStatus: "Member",
                  ...(guest.scheduleDayOfWeek !== null &&
                  guest.scheduleTimeStart !== null
                    ? {
                        schedulePreferences: {
                          create: {
                            dayOfWeek: guest.scheduleDayOfWeek,
                            timeStart: guest.scheduleTimeStart!,
                          },
                        },
                      }
                    : {}),
                },
                select: { id: true },
              })

              // Link guest → member and transfer event registrations
              await tx.guest.update({
                where: { id: req.guestId },
                data: { memberId: newMember.id },
              })
              await tx.eventRegistrant.updateMany({
                where: { guestId: req.guestId },
                data: { memberId: newMember.id, guestId: null },
              })

              await tx.smallGroupLog.create({
                data: {
                  smallGroupId: group.id,
                  action: "TempAssignmentConfirmed",
                  guestId: req.guestId,
                  memberId: newMember.id,
                  description: `${guest.firstName} ${guest.lastName} was confirmed by the group leader and promoted to member`,
                },
              })
              await tx.smallGroupLog.create({
                data: {
                  smallGroupId: group.id,
                  action: "MemberAdded",
                  memberId: newMember.id,
                  description: `${guest.firstName} ${guest.lastName} joined the group`,
                },
              })
            }
          } else if (req.memberId && req.member) {
            const memberName = `${req.member.firstName} ${req.member.lastName}`
            // Member transfer: move from old group to new group
            await tx.member.update({
              where: { id: req.memberId },
              data: {
                smallGroupId: group.id,
                groupStatus: "Member",
              },
            })

            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "TempAssignmentConfirmed",
                memberId: req.memberId,
                fromGroupId: req.fromGroupId ?? null,
                toGroupId: group.id,
                description: `${memberName}'s transfer was confirmed by the group leader`,
              },
            })
            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "MemberTransferred",
                memberId: req.memberId,
                fromGroupId: req.fromGroupId ?? null,
                toGroupId: group.id,
                description: `${memberName} transferred into this group`,
              },
            })

            // Log removal from old group if applicable
            if (req.fromGroupId) {
              await tx.smallGroupLog.create({
                data: {
                  smallGroupId: req.fromGroupId,
                  action: "MemberTransferred",
                  memberId: req.memberId,
                  fromGroupId: req.fromGroupId,
                  toGroupId: group.id,
                  description: `${memberName} transferred out of this group`,
                },
              })
            }
          }
        } else {
          // Rejected
          const personName = req.guest
            ? `${req.guest.firstName} ${req.guest.lastName}`
            : req.member
              ? `${req.member.firstName} ${req.member.lastName}`
              : "Unknown"
          await tx.smallGroupLog.create({
            data: {
              smallGroupId: group.id,
              action: "TempAssignmentRejected",
              guestId: req.guestId ?? null,
              memberId: req.memberId ?? null,
              description: `${personName}'s membership was declined by the group leader`,
            },
          })
        }

        // Mark request resolved
        await tx.smallGroupMemberRequest.update({
          where: { id: req.id },
          data: { status: resolvedStatus, resolvedAt: now },
        })
      }
    })

    revalidatePath(`/small-groups`)
    revalidatePath(`/small-groups/${group.id}`)
    revalidatePath("/guests")
    for (const guestId of affectedGuestIds) {
      revalidatePath(`/guests/${guestId}`)
    }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to submit confirmations. Please try again." }
  }
}
