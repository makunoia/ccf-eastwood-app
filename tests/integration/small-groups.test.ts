import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

import {
  addMemberToGroup,
  removeMemberFromGroup,
  updateMemberGroupStatus,
  assignGuestToGroupTemporarily,
  assignMemberTransferTemporarily,
  cancelTempAssignment,
} from "@/app/(dashboard)/small-groups/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupLog", "SmallGroupMemberRequest", "SmallGroup", "Guest", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(overrides: { firstName?: string; lastName?: string } = {}) {
  return db.member.create({
    data: {
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "Member",
      dateJoined: new Date(),
    },
    select: { id: true },
  })
}

async function seedGroup(leaderId: string, overrides: { memberLimit?: number; name?: string } = {}) {
  return db.smallGroup.create({
    data: {
      name: overrides.name ?? "Test Group",
      leaderId,
      memberLimit: overrides.memberLimit,
    },
    select: { id: true },
  })
}

describe("addMemberToGroup", () => {
  it("sets member.smallGroupId and member.groupStatus", async () => {
    const leader = await seedMember({ firstName: "Leader" })
    const group = await seedGroup(leader.id)
    const member = await seedMember()

    const result = await addMemberToGroup(group.id, member.id)
    expect(result.success).toBe(true)

    const updated = await db.member.findUnique({ where: { id: member.id } })
    expect(updated?.smallGroupId).toBe(group.id)
    expect(updated?.groupStatus).toBe("Member")
  })

  it("writes a MemberAdded log entry", async () => {
    const leader = await seedMember({ firstName: "Leader" })
    const group = await seedGroup(leader.id)
    const member = await seedMember({ firstName: "Alice", lastName: "A" })

    await addMemberToGroup(group.id, member.id)

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "MemberAdded" },
    })
    expect(log).not.toBeNull()
    expect(log?.memberId).toBe(member.id)
  })

  it("returns an error when the group is at capacity", async () => {
    const leader = await seedMember({ firstName: "Leader" })
    const group = await seedGroup(leader.id, { memberLimit: 1 })
    await db.member.update({
      where: { id: leader.id },
      data: { smallGroupId: group.id, groupStatus: "Member" },
    })
    const newcomer = await seedMember()

    const result = await addMemberToGroup(group.id, newcomer.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("member limit")
  })

  it("returns an error when the group does not exist", async () => {
    const member = await seedMember()
    const result = await addMemberToGroup("non-existent-group", member.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Group not found")
  })
})

describe("removeMemberFromGroup", () => {
  it("clears member.smallGroupId and member.groupStatus", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const member = await db.member.create({
      data: {
        firstName: "Alice",
        lastName: "A",
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    const result = await removeMemberFromGroup(member.id, group.id)
    expect(result.success).toBe(true)

    const updated = await db.member.findUnique({ where: { id: member.id } })
    expect(updated?.smallGroupId).toBeNull()
    expect(updated?.groupStatus).toBeNull()
  })

  it("writes a MemberRemoved log entry", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const member = await db.member.create({
      data: {
        firstName: "Bob",
        lastName: "B",
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    await removeMemberFromGroup(member.id, group.id)

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "MemberRemoved" },
    })
    expect(log).not.toBeNull()
    expect(log?.memberId).toBe(member.id)
  })
})

describe("updateMemberGroupStatus", () => {
  it("updates member.groupStatus to the requested value", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const member = await db.member.create({
      data: {
        firstName: "Alice",
        lastName: "A",
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    for (const status of ["Timothy", "Leader", "Member"] as const) {
      const result = await updateMemberGroupStatus(member.id, group.id, status)
      expect(result.success).toBe(true)
      const updated = await db.member.findUnique({ where: { id: member.id } })
      expect(updated?.groupStatus).toBe(status)
    }
  })
})

describe("assignGuestToGroupTemporarily", () => {
  it("creates a Pending SmallGroupMemberRequest and a log entry", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const result = await assignGuestToGroupTemporarily(group.id, guest.id)
    expect(result.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirst({
      where: { smallGroupId: group.id, guestId: guest.id },
    })
    expect(request?.status).toBe("Pending")

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "TempAssignmentCreated" },
    })
    expect(log).not.toBeNull()
  })

  it("returns an error when a pending request for the same guest already exists", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    await assignGuestToGroupTemporarily(group.id, guest.id)
    const duplicate = await assignGuestToGroupTemporarily(group.id, guest.id)
    expect(duplicate.success).toBe(false)
    if (!duplicate.success)
      expect(duplicate.error).toContain("already has a pending assignment")
  })

  it("returns an error if the guest is already a member", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const member = await seedMember()
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [], memberId: member.id },
      select: { id: true },
    })

    const result = await assignGuestToGroupTemporarily(group.id, guest.id)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error).toContain("already been promoted to a member")
  })
})

describe("assignMemberTransferTemporarily", () => {
  it("creates a Pending transfer request with fromGroupId set", async () => {
    const leader = await seedMember()
    const fromGroup = await seedGroup(leader.id, { name: "From Group" })
    const toGroup = await seedGroup(leader.id, { name: "To Group" })
    const member = await db.member.create({
      data: {
        firstName: "Alice",
        lastName: "A",
        dateJoined: new Date(),
        smallGroupId: fromGroup.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    const result = await assignMemberTransferTemporarily(toGroup.id, member.id)
    expect(result.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirst({
      where: { smallGroupId: toGroup.id, memberId: member.id },
    })
    expect(request?.status).toBe("Pending")
    expect(request?.fromGroupId).toBe(fromGroup.id)
  })

  it("returns an error if the member is already in the target group", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const member = await db.member.create({
      data: {
        firstName: "Alice",
        lastName: "A",
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })

    const result = await assignMemberTransferTemporarily(group.id, member.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("already in this group")
  })
})

describe("cancelTempAssignment", () => {
  it("marks the request as Rejected and logs the cancellation", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, guestId: guest.id },
      select: { id: true },
    })

    const result = await cancelTempAssignment(request.id)
    expect(result.success).toBe(true)

    const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
    expect(updated?.status).toBe("Rejected")
    expect(updated?.resolvedAt).toBeInstanceOf(Date)

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "TempAssignmentRejected" },
    })
    expect(log).not.toBeNull()
  })

  it("returns an error when trying to cancel an already-resolved request", async () => {
    const leader = await seedMember()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: group.id,
        guestId: guest.id,
        status: "Confirmed",
        resolvedAt: new Date(),
      },
      select: { id: true },
    })

    const result = await cancelTempAssignment(request.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("This request has already been resolved")
  })

  it("returns an error for a non-existent request", async () => {
    const result = await cancelTempAssignment("non-existent-id")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Request not found")
  })
})
