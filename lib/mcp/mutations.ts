import "server-only"

import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import { memberSchema } from "@/lib/validations/member"
import { guestSchema } from "@/lib/validations/guest"
import { familyMemberSchema, familySchema } from "@/lib/validations/family"
import { ministrySchema } from "@/lib/validations/ministry"
import { eventSchema } from "@/lib/validations/event"
import { createVolunteerSchema, updateVolunteerSchema } from "@/lib/validations/volunteer"
import { smallGroupSchema } from "@/lib/validations/small-group"
import { PROMOTABLE_GUEST_SELECT, promoteGuestRecord } from "@/lib/people/promote-guest"
import { actorCan, actorCanWriteEvent, type McpActor } from "./auth"
import { hasValidVolunteerAssignment } from "@/lib/volunteers/role-validation"
import { revalidatePath } from "next/cache"
import { logGroupStatusChange, logMembershipMove } from "@/lib/small-groups/membership-log"

export const MCP_BATCH_LIMIT = 100
type Feature = "Members" | "Guests" | "SmallGroups" | "Ministries" | "Events" | "Volunteers"
type Result = { success: true; data: Record<string, unknown> } | { success: false; error: string }

const failure = (error: string): Result => ({ success: false, error })
const invalid = (issue?: string): Result => failure(issue ?? "Invalid input")
const canWrite = (actor: McpActor, feature: Feature) => actorCan(actor, feature, "Write")
const canDelete = (actor: McpActor, feature: Feature) => actor.role === "SuperAdmin" && canWrite(actor, feature)
const knownError = (error: unknown, fallback: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025" ? "Record not found" : fallback

function personData(input: ReturnType<typeof memberSchema.parse> | ReturnType<typeof guestSchema.parse>) {
  return { firstName: input.firstName, lastName: input.lastName, nickname: input.nickname ?? null, email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null, lifeStageId: input.lifeStageId ?? null, gender: input.gender ?? null, language: input.language, birthMonth: input.birthMonth ?? null, birthYear: input.birthYear ?? null, ageRangeBucketId: input.ageRangeBucketId ?? null, workCity: input.workCity ?? null, workIndustry: input.workIndustry ?? null, meetingPreference: input.meetingPreference ?? null }
}

export async function mutateMember(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Members") : canWrite(actor, "Members"))) return failure("You do not have permission to manage Members.")
  if (action === "delete") {
    if (!id) return invalid("Member ID is required")
    const led = await db.smallGroup.findFirst({ where: { leaderId: id }, select: { name: true } })
    if (led) return failure(`Cannot delete this member because they lead the DGroup “${led.name}”. Reassign the leader first.`)
    try {
      await db.$transaction(async (tx) => {
        const member = await tx.member.findUnique({ where: { id }, select: { firstName: true, lastName: true, smallGroupId: true } })
        if (!member) throw new Prisma.PrismaClientKnownRequestError("Member not found", { code: "P2025", clientVersion: Prisma.prismaVersion.client })
        await logMembershipMove(tx, { memberId: id, memberName: `${member.firstName} ${member.lastName}`, fromGroupId: member.smallGroupId, toGroupId: null, actor: { userId: actor.id }, context: "when their member record was deleted through the Churchie ChatGPT plugin" })
        await tx.member.delete({ where: { id } })
      })
      revalidatePath("/members"); revalidatePath("/small-groups"); return { success: true, data: { id } }
    } catch (e) { return failure(knownError(e, "Unable to delete member because linked records still require it.")) }
  }
  const parsed = memberSchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const duplicate = await checkDuplicateContactInfo({ phone: parsed.data.phone, email: parsed.data.email, ...(id ? { excludeMemberId: id } : {}) })
  if (duplicate.conflict) return failure(duplicate.message)
  try {
    const data = { ...personData(parsed.data), address: parsed.data.address ?? null, dateJoined: parsed.data.dateJoined }
    const record = action === "create" ? await db.member.create({ data, select: { id: true, firstName: true, lastName: true } }) : await db.member.update({ where: { id: id! }, data, select: { id: true, firstName: true, lastName: true } })
    revalidatePath("/members"); return { success: true, data: record }
  } catch (e) { return failure(knownError(e, action === "create" ? "Failed to create member" : "Failed to update member")) }
}

export async function mutateGuest(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Guests") : canWrite(actor, "Guests"))) return failure("You do not have permission to manage Guests.")
  if (action === "delete") { if (!id) return invalid("Guest ID is required"); try { await db.guest.delete({ where: { id } }); return { success: true, data: { id } } } catch (e) { return failure(knownError(e, "Unable to delete guest because linked records still require it.")) } }
  const parsed = guestSchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const duplicate = await checkDuplicateContactInfo({ phone: parsed.data.phone, email: parsed.data.email, ...(id ? { excludeGuestId: id } : {}) }); if (duplicate.conflict) return failure(duplicate.message)
  try { const record = action === "create" ? await db.guest.create({ data: personData(parsed.data), select: { id: true, firstName: true, lastName: true } }) : await db.guest.update({ where: { id: id! }, data: personData(parsed.data), select: { id: true, firstName: true, lastName: true } }); revalidatePath("/guests"); return { success: true, data: record } } catch (e) { return failure(knownError(e, action === "create" ? "Failed to create guest" : "Failed to update guest")) }
}

export async function mutateFamily(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Members") : canWrite(actor, "Members"))) return failure("You do not have permission to manage Families.")
  if (action === "delete") { if (!id) return invalid("Family ID is required"); try { await db.family.delete({ where: { id } }); return { success: true, data: { id } } } catch (e) { return failure(knownError(e, "Failed to delete family")) } }
  const parsed = familySchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  try { const record = action === "create" ? await db.family.create({ data: parsed.data, select: { id: true, name: true } }) : await db.family.update({ where: { id: id! }, data: parsed.data, select: { id: true, name: true } }); return { success: true, data: record } } catch (e) { return failure(knownError(e, "Failed to save family")) }
}

export async function addMcpFamilyMember(actor: McpActor, familyId: string, raw: unknown): Promise<Result> {
  if (!canWrite(actor, "Members")) return failure("You do not have permission to manage Families.")
  const parsed = familyMemberSchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const family = await db.family.findUnique({ where: { id: familyId }, select: { id: true } }); if (!family) return failure("Family not found")
  if (parsed.data.memberId && !await db.member.findUnique({ where: { id: parsed.data.memberId } })) return failure("Member not found")
  if (parsed.data.guestId) { const guest = await db.guest.findUnique({ where: { id: parsed.data.guestId }, select: { memberId: true } }); if (!guest) return failure("Guest not found"); if (guest.memberId) return failure("This guest has been promoted to a member — add them as a member instead") }
  try { const record = await db.familyMember.create({ data: { familyId, ...parsed.data }, select: { id: true, familyId: true, role: true } }); return { success: true, data: record } } catch { return failure("This person is already part of the family") }
}

export async function updateMcpFamilyMemberRole(actor: McpActor, familyMemberId: string, role: unknown): Promise<Result> {
  if (!canWrite(actor, "Members")) return failure("You do not have permission to manage Families.")
  const parsed = familyMemberSchema.shape.role.safeParse(role); if (!parsed.success) return invalid("Invalid family role")
  try { const record = await db.familyMember.update({ where: { id: familyMemberId }, data: { role: parsed.data }, select: { id: true, familyId: true, role: true } }); return { success: true, data: record } } catch (error) { return failure(knownError(error, "Family member not found")) }
}

export async function removeMcpFamilyMember(actor: McpActor, familyMemberId: string): Promise<Result> {
  if (!canDelete(actor, "Members")) return failure("Only Super Admins can remove family members through MCP.")
  try { const record = await db.familyMember.delete({ where: { id: familyMemberId }, select: { id: true, familyId: true } }); return { success: true, data: record } } catch (error) { return failure(knownError(error, "Family member not found")) }
}

export async function promoteMcpGuest(actor: McpActor, guestId: string, raw: { dateJoined: string; groupId?: string | null }): Promise<Result> {
  if (!canWrite(actor, "Guests") || !canWrite(actor, "Members")) return failure("You need Guest and Member write permission to promote a guest.")
  const dateJoined = new Date(raw.dateJoined); if (Number.isNaN(dateJoined.getTime())) return invalid("A valid date joined is required")
  const guest = await db.guest.findUnique({ where: { id: guestId }, select: PROMOTABLE_GUEST_SELECT }); if (!guest) return failure("Guest not found")
  if (guest.memberId) return failure("This guest has already been promoted")
  const group = raw.groupId ? await db.smallGroup.findUnique({ where: { id: raw.groupId }, select: { id: true, status: true } }) : null
  if (raw.groupId && !group) return failure("DGroup not found")
  try { const result = await db.$transaction((tx) => promoteGuestRecord(tx, { guestId, guest, dateJoined, group })); return { success: true, data: result } } catch { return failure("Failed to promote guest") }
}

export async function moveMcpDGroupMember(actor: McpActor, memberId: string, groupId: string | null, status: "Member" | "Timothy" | "Leader" | null): Promise<Result> {
  if (!canWrite(actor, "SmallGroups") || !canWrite(actor, "Members")) return failure("You need DGroup and Member write permission to change a roster.")
  if (groupId && !status) return invalid("A group status is required when assigning a DGroup")
  const [member, group] = await Promise.all([
    db.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true, smallGroupId: true, groupStatus: true } }),
    groupId ? db.smallGroup.findUnique({ where: { id: groupId }, select: { id: true, memberLimit: true, _count: { select: { members: true } } } }) : null,
  ])
  if (!member) return failure("Member not found")
  if (groupId && !group) return failure("DGroup not found")
  if (group && member.smallGroupId !== group.id && group.memberLimit !== null && group._count.members >= group.memberLimit) return failure("This DGroup is already at its member limit.")
  const memberName = `${member.firstName} ${member.lastName}`
  try {
    await db.$transaction(async (tx) => {
      await tx.member.update({ where: { id: memberId }, data: { smallGroupId: groupId, groupStatus: groupId ? status : null } })
      await logMembershipMove(tx, { memberId, memberName, fromGroupId: member.smallGroupId, toGroupId: groupId, actor: { userId: actor.id }, context: "through the Churchie ChatGPT plugin" })
      if (groupId && member.smallGroupId === groupId && status) await logGroupStatusChange(tx, { smallGroupId: groupId, memberId, memberName, from: member.groupStatus, to: status, actor: { userId: actor.id } })
    })
    revalidatePath("/members"); revalidatePath("/small-groups"); if (groupId) revalidatePath(`/small-groups/${groupId}`)
    return { success: true, data: { memberId, groupId, status: groupId ? status : null } }
  } catch (e) { return failure(knownError(e, "Failed to update DGroup roster")) }
}

export async function mutateMinistry(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Ministries") : canWrite(actor, "Ministries"))) return failure("You do not have permission to manage Ministries.")
  if (action === "delete") { if (!id) return invalid("Ministry ID is required"); try { await db.ministry.delete({ where: { id } }); return { success: true, data: { id } } } catch (e) { return failure(knownError(e, "Unable to delete ministry because linked records still require it.")) } }
  const parsed = ministrySchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  try { const record = action === "create" ? await db.ministry.create({ data: parsed.data, select: { id: true, name: true } }) : await db.ministry.update({ where: { id: id! }, data: parsed.data, select: { id: true, name: true } }); return { success: true, data: record } } catch (e) { return failure(knownError(e, "A ministry with this name already exists")) }
}

export async function mutateEvent(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Events") : canWrite(actor, "Events"))) return failure("You do not have permission to manage Events.")
  // A new event has no UserEventAccess row yet. Until an explicit assignment
  // policy exists, only a Super Admin can create one through MCP.
  if (action === "create" && actor.role !== "SuperAdmin") return failure("Only Super Admins can create events through MCP.")
  if (id && !actorCanWriteEvent(actor, id)) return failure("You do not have access to this event.")
  if (action === "delete") { if (!id) return invalid("Event ID is required"); try { await db.event.delete({ where: { id } }); return { success: true, data: { id } } } catch (e) { return failure(knownError(e, "Unable to delete event because linked records still require it.")) } }
  const parsed = eventSchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  if (action === "update") {
    const current = await db.event.findUnique({ where: { id: id! }, select: { type: true } })
    if (!current) return failure("Event not found")
    if (current.type !== parsed.data.type) return failure("Event type cannot be changed after creation.")
  }
  const { ministryIds, ...eventValues } = parsed.data
  const data = { ...eventValues, endDate: parsed.data.endDate ?? parsed.data.startDate }
  try {
    const record = action === "create"
      ? await db.event.create({ data: { ...data, ministries: { create: data.allMinistries ? [] : ministryIds.map((ministryId) => ({ ministryId })) } }, select: { id: true, name: true } })
      : await db.$transaction(async (tx) => { await tx.event.update({ where: { id: id! }, data }); await tx.eventMinistry.deleteMany({ where: { eventId: id! } }); await tx.eventMinistry.createMany({ data: data.allMinistries ? [] : ministryIds.map((ministryId) => ({ eventId: id!, ministryId })), skipDuplicates: true }); return tx.event.findUniqueOrThrow({ where: { id: id! }, select: { id: true, name: true } }) })
    return { success: true, data: record }
  } catch (e) { return failure(knownError(e, "Failed to save event")) }
}

export async function mutateVolunteer(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "Volunteers") : canWrite(actor, "Volunteers"))) return failure("You do not have permission to manage Volunteers.")
  if (action === "delete") { if (!id) return invalid("Volunteer ID is required"); const row = await db.volunteer.findUnique({ where: { id }, select: { eventId: true } }); if (!row) return failure("Volunteer not found"); if (!actorCanWriteEvent(actor, row.eventId)) return failure("You do not have access to this event."); try { await db.volunteer.delete({ where: { id } }); return { success: true, data: { id } } } catch { return failure("Failed to delete volunteer") } }
  const parsed = (action === "create" ? createVolunteerSchema : updateVolunteerSchema).safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  if (!actorCanWriteEvent(actor, parsed.data.eventId)) return failure("You do not have access to this event.")
  const assignedRoleId: string | null | undefined = "assignedRoleId" in parsed.data && typeof parsed.data.assignedRoleId === "string" ? parsed.data.assignedRoleId : null
  if (!await hasValidVolunteerAssignment(parsed.data.eventId, parsed.data.committeeId, parsed.data.preferredRoleId, assignedRoleId)) return failure("Committee and roles must belong to this event.")
  try { const record = action === "create" ? await db.volunteer.create({ data: { ...parsed.data, leaderApprovalToken: crypto.randomUUID() }, select: { id: true, eventId: true, memberId: true } }) : await db.volunteer.update({ where: { id: id! }, data: parsed.data, select: { id: true, eventId: true, memberId: true } }); revalidatePath("/volunteers"); revalidatePath(`/event/${record.eventId}/breakouts`, "layout"); return { success: true, data: record } } catch (e) { return failure(knownError(e, "Failed to save volunteer")) }
}

export async function mutateSmallGroup(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw?: unknown): Promise<Result> {
  if (!(action === "delete" ? canDelete(actor, "SmallGroups") : canWrite(actor, "SmallGroups"))) return failure("You do not have permission to manage DGroups.")
  if (action === "delete") { if (!id) return invalid("DGroup ID is required"); try { await db.smallGroup.delete({ where: { id } }); return { success: true, data: { id } } } catch (e) { return failure(knownError(e, "Unable to delete DGroup because linked members, requests, or event records still require it.")) } }
  const parsed = smallGroupSchema.safeParse(raw); if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  if (id && parsed.data.parentGroupId === id) return failure("A group cannot be its own parent")
  if (id && parsed.data.parentGroupId) {
    let cursor: string | null = parsed.data.parentGroupId
    while (cursor) {
      if (cursor === id) return failure("Cannot set a descendant group as the parent")
      const parent: { parentGroupId: string | null } | null = await db.smallGroup.findUnique({ where: { id: cursor }, select: { parentGroupId: true } })
      cursor = parent?.parentGroupId ?? null
    }
  }
  if (action === "update" && parsed.data.memberLimit !== null) {
    const count = await db.member.count({ where: { smallGroupId: id! } })
    if (count > parsed.data.memberLimit) return failure(`Cannot set limit to ${parsed.data.memberLimit}: group currently has ${count} member${count === 1 ? "" : "s"}`)
  }
  const { parentScope: _parentScope, lifeStageIds, ...groupValues } = parsed.data
  try {
    const record = action === "create"
      ? await db.$transaction(async (tx) => {
          const leader = await tx.member.findUnique({ where: { id: groupValues.leaderId }, select: { firstName: true, lastName: true, smallGroupId: true } })
          if (!leader) throw new Error("leader-not-found")
          const created = await tx.smallGroup.create({ data: { ...groupValues, lifeStages: { connect: lifeStageIds.map((id) => ({ id })) } }, select: { id: true, name: true, leaderId: true } })
          if (groupValues.parentGroupId) {
            await tx.member.update({ where: { id: groupValues.leaderId }, data: { smallGroupId: groupValues.parentGroupId, groupStatus: "Member" } })
            await logMembershipMove(tx, { memberId: groupValues.leaderId, memberName: `${leader.firstName} ${leader.lastName}`, fromGroupId: leader.smallGroupId, toGroupId: groupValues.parentGroupId, actor: { userId: actor.id }, context: `as the leader of "${groupValues.name}" through the Churchie ChatGPT plugin` })
          }
          await tx.smallGroupLog.create({ data: { smallGroupId: created.id, action: "GroupCreated", performedByUserId: actor.id, description: `Group "${groupValues.name}" was created through the Churchie ChatGPT plugin` } })
          await tx.breakoutGroup.updateMany({ where: { linkedSmallGroupId: null, OR: [{ facilitator: { memberId: groupValues.leaderId } }, { coFacilitator: { memberId: groupValues.leaderId } }] }, data: { linkedSmallGroupId: created.id } })
          return created
        })
      : await db.smallGroup.update({ where: { id: id! }, data: { ...groupValues, lifeStages: { set: lifeStageIds.map((id) => ({ id })) } }, select: { id: true, name: true, leaderId: true } })
    revalidatePath("/small-groups"); if (groupValues.parentGroupId) revalidatePath(`/small-groups/${groupValues.parentGroupId}`); return { success: true, data: record }
  } catch (e) { return failure(knownError(e, "Failed to save DGroup")) }
}

export async function runMcpBulk(actor: McpActor, feature: Feature | "Families", operations: Array<{ action: "create" | "update" | "delete"; id?: string; data?: unknown }>) {
  if (actor.role !== "SuperAdmin") return { success: false, error: "Bulk operations are available only to Super Admins." }
  if (operations.length > MCP_BATCH_LIMIT) return { success: false, error: `Bulk operations are limited to ${MCP_BATCH_LIMIT} records.` }
  const handler = feature === "Members" ? mutateMember : feature === "Guests" ? mutateGuest : feature === "SmallGroups" ? mutateSmallGroup : feature === "Ministries" ? mutateMinistry : feature === "Events" ? mutateEvent : feature === "Volunteers" ? mutateVolunteer : mutateFamily
  const results = await Promise.all(operations.map(async (operation, index) => ({ index, ...await handler(actor, operation.action, operation.id, operation.data) })))
  return { success: true, results, succeeded: results.filter((item) => item.success).length, skipped: results.filter((item) => !item.success).length }
}
