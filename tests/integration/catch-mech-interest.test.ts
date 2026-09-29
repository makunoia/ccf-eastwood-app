import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  assignCatchMechInterest,
  deleteCatchMechInterest,
  dismissCatchMechInterest,
  getCatchMechInterestMatches,
} from "@/app/(event)/event/[id]/catch-mech/interest-actions"
import { resolveMemberRequestsBatch } from "@/app/(dashboard)/small-groups/actions"
import { loadEventInterests } from "@/app/(event)/event/[id]/catch-mech/interest-data"
import { addMemberToGroup, assignGuestToGroupTemporarily, assignMemberTransferTemporarily, requestCoupleAssignment } from "@/app/(dashboard)/small-groups/actions"
import { assignMemberToSmallGroup } from "@/app/(dashboard)/members/matching-actions"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import { reopenCatchMechRequest } from "@/app/(event)/event/[id]/catch-mech/matching-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "Event", "User" RESTART IDENTITY CASCADE`
  await db.user.create({ data: { id: "u1", username: "catch-mech-interest-admin", role: "SuperAdmin" } })
  vi.mocked(auth).mockResolvedValue({
    user: { id: "u1", role: "SuperAdmin" },
  } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seed() {
  const [event, otherEvent] = await Promise.all([
    db.event.create({ data: { name: "Sunday", type: "OneTime", startDate: new Date("2026-08-01"), endDate: new Date("2026-08-01") } }),
    db.event.create({ data: { name: "Saturday", type: "OneTime", startDate: new Date("2026-08-02"), endDate: new Date("2026-08-02") } }),
  ])
  const leader = await db.member.create({ data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] } })
  const group = await db.smallGroup.create({ data: { name: "Ortigas", leaderId: leader.id, language: [] } })
  return { event, otherEvent, group }
}

describe("Catch Mech event interest", () => {
  it("deletes pending and dismissed interests only from their source event, keeping profiles", async () => {
    const { event, otherEvent, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const pending = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    const dismissed = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id, status: "Rejected" },
    })
    const assigned = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id, smallGroupId: group.id },
    })

    expect((await deleteCatchMechInterest(otherEvent.id, pending.id)).success).toBe(false)
    expect((await deleteCatchMechInterest(event.id, assigned.id)).success).toBe(false)
    expect((await deleteCatchMechInterest(event.id, pending.id)).success).toBe(true)
    expect((await deleteCatchMechInterest(event.id, dismissed.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.findMany({ where: { sourceEventId: event.id }, select: { id: true } })).toEqual([{ id: assigned.id }])
    expect(await db.guest.findUnique({ where: { id: guest.id } })).not.toBeNull()
  })

  it("scopes matches and dismissal to the request's source event", async () => {
    const { event, otherEvent } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id, status: "Pending" },
    })
    const otherGuest = await db.guest.create({ data: { firstName: "Other", lastName: "Guest", language: [] } })
    await db.smallGroupMemberRequest.create({
      data: { guestId: otherGuest.id, origin: "RegistrationIntent", sourceEventId: otherEvent.id, status: "Pending" },
    })

    expect((await loadEventInterests(event.id)).map((row) => row.id)).toEqual([request.id])

    expect((await getCatchMechInterestMatches(otherEvent.id, request.id)).success).toBe(false)
    expect((await dismissCatchMechInterest(otherEvent.id, request.id)).success).toBe(false)
    expect((await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("Pending")

    expect((await dismissCatchMechInterest(event.id, request.id)).success).toBe(true)
    const dismissed = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(dismissed.status).toBe("Rejected")
    expect(dismissed.resolvedAt).not.toBeNull()
    expect(dismissed.sourceEventId).toBe(event.id)
    expect((await loadEventInterests(event.id)).map((row) => row.status)).toEqual(["Rejected"])
  })

  it("converts a guest's interest into the same pending request, then tracks leader confirmation", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id, status: "Pending" },
    })

    const matches = await getCatchMechInterestMatches(event.id, request.id)
    expect(matches.success).toBe(true)
    if (matches.success) expect(matches.data.flatMap((level) => level.matches.map((match) => match.groupId))).toContain(group.id)

    const assigned = await assignCatchMechInterest(event.id, request.id, group.id)
    expect(assigned).toEqual({ success: true, data: "awaiting-confirmation" })
    const pending = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(pending.status).toBe("Pending")
    expect(pending.smallGroupId).toBe(group.id)
    expect(pending.sourceEventId).toBe(event.id)
    expect(await db.smallGroupMemberRequest.count({ where: { guestId: guest.id } })).toBe(1)
    expect((await loadEventInterests(event.id))[0]).toMatchObject({ id: request.id, status: "Pending", groupId: group.id })

    const resolved = await resolveMemberRequestsBatch([request.id], "approve")
    expect(resolved.success).toBe(true)
    const confirmed = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(confirmed.status).toBe("Confirmed")
    expect(confirmed.sourceEventId).toBe(event.id)
    expect(confirmed.memberId).not.toBeNull()
    expect((await loadEventInterests(event.id))[0]).toMatchObject({ id: request.id, status: "Confirmed", personType: "Member" })
  })

  it("places an ungrouped member directly and retains the event source", async () => {
    const { event, group } = await seed()
    const member = await db.member.create({ data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, origin: "RegistrationIntent", sourceEventId: event.id, status: "Pending" },
    })

    const result = await assignCatchMechInterest(event.id, request.id, group.id)
    expect(result).toEqual({ success: true, data: "placed" })
    const placed = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(placed.status).toBe("Confirmed")
    expect(placed.smallGroupId).toBe(group.id)
    expect(placed.sourceEventId).toBe(event.id)
    expect((await db.member.findUniqueOrThrow({ where: { id: member.id } })).smallGroupId).toBe(group.id)
  })

  it("turns a grouped member's interest into a pending transfer", async () => {
    const { event, group } = await seed()
    const oldGroup = await db.smallGroup.create({ data: { name: "Old group", leaderId: group.leaderId, language: [] } })
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [], smallGroupId: oldGroup.id },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })

    expect(await assignCatchMechInterest(event.id, request.id, group.id)).toEqual({ success: true, data: "awaiting-confirmation" })
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
      status: "Pending", smallGroupId: group.id, fromGroupId: oldGroup.id, sourceEventId: event.id,
    })
    expect((await db.member.findUniqueOrThrow({ where: { id: member.id } })).smallGroupId).toBe(oldGroup.id)
  })

  it("advances the same interest through guest and member profile assignments", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const member = await db.member.create({ data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] } })
    const guestRequest = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    const memberRequest = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })

    expect((await assignGuestToGroupTemporarily(group.id, guest.id)).success).toBe(true)
    expect((await assignMemberToSmallGroup(member.id, group.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.count({ where: { guestId: guest.id } })).toBe(1)
    expect(await db.smallGroupMemberRequest.count({ where: { memberId: member.id } })).toBe(1)
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: guestRequest.id } })).toMatchObject({
      status: "Pending", smallGroupId: group.id, sourceEventId: event.id,
    })
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: memberRequest.id } })).toMatchObject({
      status: "Confirmed", smallGroupId: group.id, sourceEventId: event.id,
    })
    expect((await loadEventInterests(event.id)).map((row) => row.id)).toContain(guestRequest.id)
    expect((await loadEventInterests(event.id)).map((row) => row.id)).toContain(memberRequest.id)
  })

  it("advances the original interest through a profile transfer or direct promotion", async () => {
    const { event, group } = await seed()
    const oldGroup = await db.smallGroup.create({ data: { name: "Old group", leaderId: group.leaderId, language: [] } })
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [], smallGroupId: oldGroup.id },
    })
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const transfer = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    const promotion = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })

    expect((await assignMemberTransferTemporarily(group.id, member.id)).success).toBe(true)
    expect((await promoteGuestToMember(guest.id, group.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: transfer.id } })).toMatchObject({
      status: "Pending", fromGroupId: oldGroup.id, smallGroupId: group.id, sourceEventId: event.id,
    })
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: promotion.id } })).toMatchObject({
      status: "Confirmed", guestId: null, smallGroupId: group.id, sourceEventId: event.id,
    })
  })

  it("keeps source events when a DGroup action places a member or requests a couple", async () => {
    const { event, group } = await seed()
    const member = await db.member.create({ data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] } })
    const spouse = await db.member.create({ data: { firstName: "Luis", lastName: "Reyes", dateJoined: new Date(), language: [] } })
    const direct = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    const couple = await db.smallGroupMemberRequest.create({
      data: { memberId: spouse.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    expect((await addMemberToGroup(group.id, member.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: direct.id } })).toMatchObject({
      status: "Confirmed", smallGroupId: group.id, sourceEventId: event.id,
    })

    const coupleGroup = await db.smallGroup.create({
      data: { name: "Couples", groupType: "Couples", leaderId: group.leaderId, language: [] },
    })
    expect((await requestCoupleAssignment(coupleGroup.id, member.id, spouse.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: couple.id } })).toMatchObject({
      status: "Pending", smallGroupId: coupleGroup.id, sourceEventId: event.id,
    })
    expect(await db.smallGroupMemberRequest.count({ where: { memberId: spouse.id } })).toBe(1)
  })

  it("keeps the same request when staff directly place someone after a pending assignment", async () => {
    const { event, group } = await seed()
    const otherGroup = await db.smallGroup.create({
      data: { name: "Other group", leaderId: group.leaderId, language: [] },
    })
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })
    expect((await assignGuestToGroupTemporarily(group.id, guest.id)).success).toBe(true)
    expect((await promoteGuestToMember(guest.id, otherGroup.id)).success).toBe(true)
    expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
      status: "Confirmed", smallGroupId: otherGroup.id, sourceEventId: event.id,
    })
    expect(await db.smallGroupMemberRequest.count({ where: { sourceEventId: event.id } })).toBe(1)
    expect(await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "TempAssignmentRejected", description: { contains: "superseded" } },
    })).not.toBeNull()
  })

  it("retains a leader-declined assignment as a declined event interest", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id, status: "Pending" },
    })
    expect((await assignCatchMechInterest(event.id, request.id, group.id)).success).toBe(true)
    expect((await resolveMemberRequestsBatch([request.id], "deny")).success).toBe(true)
    const declined = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(declined.status).toBe("Rejected")
    expect(declined.smallGroupId).toBe(group.id)
    expect(declined.sourceEventId).toBe(event.id)
    expect((await loadEventInterests(event.id))[0]).toMatchObject({ id: request.id, status: "Rejected", groupId: group.id })
  })

  it("keeps registrant-cancelled groups eligible and refuses Undo", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const breakout = await db.breakoutGroup.create({ data: { eventId: event.id, name: "Table 1", language: [] } })
    const cancelled = await db.smallGroupMemberRequest.create({
      data: {
        guestId: guest.id, smallGroupId: group.id, breakoutGroupId: breakout.id,
        status: "Rejected", resolvedAt: new Date(), registrantCancelledAt: new Date(),
      },
    })
    const interest = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", sourceEventId: event.id },
    })

    const matches = await getCatchMechInterestMatches(event.id, interest.id)
    expect(matches.success).toBe(true)
    if (matches.success) {
      expect(matches.data.flatMap((level) => level.matches.map((match) => match.groupId))).toContain(group.id)
    }
    expect((await reopenCatchMechRequest(cancelled.id, event.id)).success).toBe(false)
    expect((await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("Rejected")
  })

  it("does not undo a different event's breakout decision", async () => {
    const { event, otherEvent, group } = await seed()
    const guest = await db.guest.create({ data: { firstName: "Maria", lastName: "Santos", language: [] } })
    const breakout = await db.breakoutGroup.create({ data: { eventId: otherEvent.id, name: "Other table", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, smallGroupId: group.id, breakoutGroupId: breakout.id, status: "Rejected", resolvedAt: new Date() },
    })
    expect((await reopenCatchMechRequest(request.id, event.id)).success).toBe(false)
    expect((await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("Rejected")
  })
})
