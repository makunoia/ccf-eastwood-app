"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { repointFamilyLinks } from "@/lib/family-links"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

type Decision = {
  requestId: string
  status: "confirmed" | "pending" | "rejected"
  notes?: string
}

export async function submitMemberConfirmations(
  token: string,
  decisions: Decision[]
): Promise<ActionResult> {
  const group = await db.smallGroup.findUnique({
    where: { leaderConfirmationToken: token },
    select: { id: true, name: true, leaderId: true, status: true },
  })
  if (!group) {
    return { success: false, error: "Confirmation link not found or has expired." }
  }

  if (!decisions.length) {
    return { success: false, error: "No decisions provided." }
  }

  try {
    const affectedGuestIds = new Set<string>()
    const affectedBreakoutGroupIds = new Set<string>()

    // Pre-fetch event names for requests linked to catch mech breakout groups
    const decisionIds = decisions.map((d) => d.requestId)
    const requestsWithBreakout = await db.smallGroupMemberRequest.findMany({
      where: { id: { in: decisionIds }, breakoutGroupId: { not: null } },
      select: { id: true, breakoutGroupId: true },
    })
    const breakoutGroupIds = [...new Set(requestsWithBreakout.map((r) => r.breakoutGroupId!))]
    const breakoutGroups = breakoutGroupIds.length > 0
      ? await db.breakoutGroup.findMany({
          where: { id: { in: breakoutGroupIds } },
          select: { id: true, event: { select: { name: true } } },
        })
      : []
    const eventNameByBreakoutId = new Map(breakoutGroups.map((bg) => [bg.id, bg.event.name]))
    const eventNameByRequestId = new Map(
      requestsWithBreakout.map((r) => [r.id, eventNameByBreakoutId.get(r.breakoutGroupId!) ?? null])
    )

    await db.$transaction(async (tx) => {
      let memberConfirmed = false

      for (const { requestId, status: decisionStatus, notes: decisionNotes } of decisions) {
        const req = await tx.smallGroupMemberRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            smallGroupId: true,
            guestId: true,
            memberId: true,
            fromGroupId: true,
            breakoutGroupId: true,
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

        // "pending" means the leader deferred — leave the request untouched
        if (decisionStatus === "pending") continue

        if (req.guestId) {
          affectedGuestIds.add(req.guestId)
        }
        if (req.breakoutGroupId) {
          affectedBreakoutGroupIds.add(req.breakoutGroupId)
        }

        const now = new Date()
        const resolvedStatus = decisionStatus === "confirmed" ? "Confirmed" : "Rejected"
        let promotedMemberId: string | null = null

        const eventName = eventNameByRequestId.get(req.id) ?? null
        const catchMechContext = req.breakoutGroupId && eventName ? ` via Catch Mech Link of ${eventName}` : ""

        if (decisionStatus === "confirmed") {
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

              // Check if a member with the same email already exists to avoid
              // a P2002 unique constraint violation on Member.email.
              const existingByEmail = guest.email
                ? await tx.member.findUnique({
                    where: { email: guest.email },
                    select: { id: true },
                  })
                : null

              let resolvedMemberId: string

              if (existingByEmail) {
                // Re-use the existing member — just move them into this group
                await tx.member.update({
                  where: { id: existingByEmail.id },
                  data: { smallGroupId: group.id, groupStatus: "Member" },
                })
                resolvedMemberId = existingByEmail.id
              } else {
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
                resolvedMemberId = newMember.id
              }

              // Link guest → member and transfer event registrations
              await tx.guest.update({
                where: { id: req.guestId },
                data: { memberId: resolvedMemberId },
              })
              await tx.eventRegistrant.updateMany({
                where: { guestId: req.guestId },
                data: { memberId: resolvedMemberId, guestId: null },
              })
              await repointFamilyLinks(tx, { guestId: req.guestId }, { memberId: resolvedMemberId })

              await tx.smallGroupLog.create({
                data: {
                  smallGroupId: group.id,
                  action: "TempAssignmentConfirmed",
                  guestId: req.guestId,
                  memberId: resolvedMemberId,
                  description: `${guest.firstName} ${guest.lastName} was confirmed by the group leader${catchMechContext} and promoted to member`,
                },
              })
              await tx.smallGroupLog.create({
                data: {
                  smallGroupId: group.id,
                  action: "MemberAdded",
                  memberId: resolvedMemberId,
                  description: `${guest.firstName} ${guest.lastName} joined the group${catchMechContext}`,
                },
              })
              promotedMemberId = resolvedMemberId
              memberConfirmed = true
            } else {
              // Guest already promoted externally — track the existing member ID
              promotedMemberId = guest.memberId
              memberConfirmed = true
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
            memberConfirmed = true

            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "TempAssignmentConfirmed",
                memberId: req.memberId,
                fromGroupId: req.fromGroupId ?? null,
                toGroupId: group.id,
                description: `${memberName}'s transfer was confirmed by the group leader${catchMechContext}`,
              },
            })
            await tx.smallGroupLog.create({
              data: {
                smallGroupId: group.id,
                action: "MemberTransferred",
                memberId: req.memberId,
                fromGroupId: req.fromGroupId ?? null,
                toGroupId: group.id,
                description: `${memberName} transferred into this group${catchMechContext}`,
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
              description: `${personName}'s membership was declined by the group leader${catchMechContext}`,
            },
          })
        }

        // Mark request resolved
        await tx.smallGroupMemberRequest.update({
          where: { id: req.id },
          data: {
            status: resolvedStatus,
            resolvedAt: now,
            notes: decisionNotes ?? null,
            // When a guest was promoted, update FK to point to the new member
            // so the catch mech admin page can match the request by memberId
            ...(req.guestId && promotedMemberId ? { memberId: promotedMemberId, guestId: null } : {}),
          },
        })
      }

      if (group.status === "Pending" && memberConfirmed) {
        await tx.smallGroup.update({ where: { id: group.id }, data: { status: "Active" } })
      }
    })

    revalidatePath(`/small-groups`)
    revalidatePath(`/small-groups/${group.id}`)
    revalidatePath("/guests")
    for (const guestId of affectedGuestIds) {
      revalidatePath(`/guests/${guestId}`)
    }

    // If this leader was previously a Timothy facilitating breakout groups,
    // link those groups to this small group now that they've become a leader.
    // Only applies when the group actually has a leader.
    if (group.leaderId) {
      const updatedBreakouts = await db.breakoutGroup.findMany({
        where: {
          linkedSmallGroupId: null,
          OR: [
            { facilitator: { memberId: group.leaderId } },
            { coFacilitator: { memberId: group.leaderId } },
          ],
        },
        select: { id: true, eventId: true },
      })
      if (updatedBreakouts.length > 0) {
        await db.breakoutGroup.updateMany({
          where: { id: { in: updatedBreakouts.map((b) => b.id) } },
          data: { linkedSmallGroupId: group.id },
        })
        const eventIds = [...new Set(updatedBreakouts.map((b) => b.eventId))]
        for (const eventId of eventIds) {
          revalidatePath(`/event/${eventId}/breakouts`)
          revalidatePath(`/event/${eventId}/dashboard`)
        }
      }
    }

    // Revalidate catch-mech admin pages for any requests linked to a breakout group
    const requestIds = decisions.map((d) => d.requestId)
    const linked = await db.smallGroupMemberRequest.findMany({
      where: { id: { in: requestIds }, breakoutGroupId: { not: null } },
      select: { breakoutGroupId: true },
    })
    if (linked.length > 0) {
      const bgIds = [...new Set(linked.map((r) => r.breakoutGroupId!))]
      const breakoutGroups = await db.breakoutGroup.findMany({
        where: { id: { in: bgIds } },
        select: { eventId: true },
      })
      const eventIds = [...new Set(breakoutGroups.map((bg) => bg.eventId))]
      for (const eventId of eventIds) {
        revalidatePath(`/event/${eventId}/catch-mech`)
        revalidatePath(`/event/${eventId}/dashboard`)
      }
    }

    return { success: true, data: undefined }
  } catch (e) {
    console.error("[submitMemberConfirmations] error:", e)
    return { success: false, error: "Failed to submit confirmations. Please try again." }
  }
}
