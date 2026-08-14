import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { resolveMemberRequestsBatch } from "@/app/(dashboard)/small-groups/actions"
import { personNameOf } from "@/lib/small-groups/resolve-member-request"

/**
 * Admins settling DGroup requests on the leader's behalf, one row or twenty.
 *
 * The leader's own token form is covered by ccf-38/ccf-48/ccf-63; those suites are
 * the regression net for the shared `resolveMemberRequest` this action now runs.
 * What's tested here is the half that is new: admin attribution, and a batch that
 * reports per-row failures instead of aborting.
 */

const ADMIN_ID = "admin-user-1"

type TestSession = {
  user: {
    id: string | undefined
    name: string
    email: string
    username: string
    role: "SuperAdmin" | "Staff"
    permissions: never[]
    eventAccess: never[]
    totpEnabled: boolean
    mustChangePassword: boolean
    requiresTotpSetup: boolean
  }
}

/**
 * `auth` is overloaded (session getter *and* middleware wrapper), so `vi.mocked`
 * lands on the wrong signature. Narrowing it to the session-getter shape is what
 * lets the mock helpers typecheck.
 */
const mockAuth = vi.mocked(auth as unknown as () => Promise<TestSession | null>)

function session(role: "SuperAdmin" | "Staff", id: string | undefined): TestSession {
  return {
    user: {
      id,
      name: "Test Admin",
      email: "test@example.com",
      username: "test-admin",
      role,
      permissions: [],
      eventAccess: [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
    },
  }
}

async function seedLeaderAndGroup(opts: { memberLimit?: number; status?: "Active" | "Pending" } = {}) {
  const leader = await db.member.create({
    data: { firstName: "Grace", lastName: "Lim", language: [], dateJoined: new Date() },
  })
  const group = await db.smallGroup.create({
    data: {
      name: "Tuesday DGroup",
      leaderId: leader.id,
      language: [],
      memberLimit: opts.memberLimit ?? null,
      status: opts.status ?? "Active",
    },
  })
  return { leader, group }
}

async function seedGuestRequest(groupId: string, firstName = "Jane") {
  const guest = await db.guest.create({
    data: { firstName, lastName: "Doe", language: [] },
  })
  const request = await db.smallGroupMemberRequest.create({
    data: { smallGroupId: groupId, guestId: guest.id, status: "Pending" },
  })
  return { guest, request }
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "ConfirmationSubmission", "SmallGroupLog", "SmallGroupMemberRequest", "Guest", "SmallGroup", "Member", "User" RESTART IDENTITY CASCADE`
  await db.user.create({
    data: { id: ADMIN_ID, username: "test-admin", name: "Test Admin", role: "SuperAdmin" },
  })
  mockAuth.mockResolvedValue(session("SuperAdmin", ADMIN_ID))
})

afterAll(async () => {
  // Back to the suite-wide default so a shared worker doesn't inherit our admin id.
  mockAuth.mockResolvedValue(session("SuperAdmin", undefined))
  await db.$disconnect()
})

// ─── Unit ────────────────────────────────────────────────────────────────────

describe("personNameOf", () => {
  const base = {
    id: "r1",
    smallGroupId: "g1",
    guestId: null,
    memberId: null,
    fromGroupId: null,
    breakoutGroupId: null,
    status: "Pending" as const,
    guest: null,
    member: null,
  }

  it("prefers the member over the guest, since a promoted request carries both", () => {
    expect(
      personNameOf({
        ...base,
        member: { firstName: "Ana", lastName: "Cruz" },
        guest: { firstName: "Stale", lastName: "Guest" } as never,
      })
    ).toBe("Ana Cruz")
  })

  it("falls back to the guest", () => {
    expect(personNameOf({ ...base, guest: { firstName: "Jane", lastName: "Doe" } as never })).toBe(
      "Jane Doe"
    )
  })

  it("never returns an empty label when the person is gone", () => {
    expect(personNameOf(base)).toBe("Unknown")
  })
})

// ─── Approve ─────────────────────────────────────────────────────────────────

describe("resolveMemberRequestsBatch — approve", () => {
  it("promotes a guest, places them in the group, and repoints the request", async () => {
    const { group } = await seedLeaderAndGroup()
    const { guest, request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id], "approve")

    expect(result).toEqual({ success: true, data: { resolved: 1, failed: [] } })

    const promoted = await db.guest.findUnique({ where: { id: guest.id } })
    expect(promoted?.memberId).not.toBeNull()

    const member = await db.member.findUnique({ where: { id: promoted!.memberId! } })
    expect(member?.smallGroupId).toBe(group.id)
    expect(member?.groupStatus).toBe("Member")

    const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
    expect(updated?.status).toBe("Confirmed")
    expect(updated?.resolvedAt).not.toBeNull()
    // Repointed off the guest identity so downstream screens still find the person.
    expect(updated?.memberId).toBe(promoted!.memberId)
    expect(updated?.guestId).toBeNull()
  })

  it("attributes the decision to the admin and says it was made for the leader", async () => {
    const { leader, group } = await seedLeaderAndGroup()
    const { request } = await seedGuestRequest(group.id)

    await resolveMemberRequestsBatch([request.id], "approve")

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "TempAssignmentConfirmed" },
    })
    expect(log?.performedByUserId).toBe(ADMIN_ID)
    // Still the leader's decision on the record — the admin only carried it out.
    expect(log?.performedByMemberId).toBe(leader.id)
    expect(log?.description).toContain("on the group leader's behalf")
  })

  it("moves a transferring member and logs the exit on the old group too", async () => {
    const { group } = await seedLeaderAndGroup()
    const oldLeader = await db.member.create({
      data: { firstName: "Old", lastName: "Leader", language: [], dateJoined: new Date() },
    })
    const oldGroup = await db.smallGroup.create({
      data: { name: "Old DGroup", leaderId: oldLeader.id, language: [] },
    })
    const mover = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Cruz",
        language: [],
        dateJoined: new Date(),
        smallGroupId: oldGroup.id,
        groupStatus: "Member",
      },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: {
        smallGroupId: group.id,
        memberId: mover.id,
        fromGroupId: oldGroup.id,
        status: "Pending",
      },
    })

    const result = await resolveMemberRequestsBatch([request.id], "approve")
    expect(result.success && result.data.resolved).toBe(1)

    const moved = await db.member.findUnique({ where: { id: mover.id } })
    expect(moved?.smallGroupId).toBe(group.id)

    const exitLog = await db.smallGroupLog.findFirst({
      where: { smallGroupId: oldGroup.id, action: "MemberTransferred" },
    })
    expect(exitLog?.description).toContain("transferred out of this group")
  })

  it("wakes a Pending group on its first confirmed member", async () => {
    const { group } = await seedLeaderAndGroup({ status: "Pending" })
    const { request } = await seedGuestRequest(group.id)

    await resolveMemberRequestsBatch([request.id], "approve")

    const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(updated?.status).toBe("Active")
  })

  it("clears the upward satellite of a member who now has a DGroup here", async () => {
    const { group } = await seedLeaderAndGroup()
    const satelliteLeader = await db.member.create({
      data: {
        firstName: "Paolo",
        lastName: "Reyes",
        language: [],
        dateJoined: new Date(),
        upwardSatellite: "CCF Ortigas",
      },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, memberId: satelliteLeader.id, status: "Pending" },
    })

    await resolveMemberRequestsBatch([request.id], "approve")

    const updated = await db.member.findUnique({ where: { id: satelliteLeader.id } })
    expect(updated?.upwardSatellite).toBeNull()
  })
})

// ─── Deny ────────────────────────────────────────────────────────────────────

describe("resolveMemberRequestsBatch — deny", () => {
  it("rejects the request and leaves the guest un-promoted", async () => {
    const { group } = await seedLeaderAndGroup()
    const { guest, request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id], "deny")
    expect(result).toEqual({ success: true, data: { resolved: 1, failed: [] } })

    const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
    expect(updated?.status).toBe("Rejected")
    expect(updated?.resolvedAt).not.toBeNull()

    const untouched = await db.guest.findUnique({ where: { id: guest.id } })
    expect(untouched?.memberId).toBeNull()
    expect(await db.member.count()).toBe(1) // the leader only

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: group.id, action: "TempAssignmentRejected" },
    })
    expect(log?.performedByUserId).toBe(ADMIN_ID)
    expect(log?.description).toContain("on the group leader's behalf")
  })

  it("does not move a transferring member out of their current group", async () => {
    const { group } = await seedLeaderAndGroup()
    const stayer = await db.member.create({
      data: { firstName: "Ana", lastName: "Cruz", language: [], dateJoined: new Date() },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, memberId: stayer.id, status: "Pending" },
    })

    await resolveMemberRequestsBatch([request.id], "deny")

    const updated = await db.member.findUnique({ where: { id: stayer.id } })
    expect(updated?.smallGroupId).toBeNull()
    expect(updated?.groupStatus).toBeNull()
  })
})

// ─── Batch behaviour & edge cases ────────────────────────────────────────────

describe("resolveMemberRequestsBatch — batch and edges", () => {
  it("resolves every selected row in one call", async () => {
    const { group } = await seedLeaderAndGroup()
    const a = await seedGuestRequest(group.id, "Ann")
    const b = await seedGuestRequest(group.id, "Ben")
    const c = await seedGuestRequest(group.id, "Cal")

    const result = await resolveMemberRequestsBatch(
      [a.request.id, b.request.id, c.request.id],
      "approve"
    )

    expect(result.success && result.data).toEqual({ resolved: 3, failed: [] })
    expect(
      await db.smallGroupMemberRequest.count({ where: { status: "Confirmed" } })
    ).toBe(3)
  })

  it("keeps going when one row is already resolved, and names it in failed", async () => {
    const { group } = await seedLeaderAndGroup()
    const good = await seedGuestRequest(group.id, "Ann")
    const stale = await seedGuestRequest(group.id, "Ben")
    await db.smallGroupMemberRequest.update({
      where: { id: stale.request.id },
      data: { status: "Confirmed", resolvedAt: new Date() },
    })

    const result = await resolveMemberRequestsBatch(
      [good.request.id, stale.request.id],
      "approve"
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.resolved).toBe(1)
    expect(result.data.failed).toEqual([
      { id: stale.request.id, name: "Ben Doe", reason: "already resolved" },
    ])
  })

  it("refuses to approve past the group's member limit and leaves the row pending", async () => {
    const { group } = await seedLeaderAndGroup({ memberLimit: 1 })
    await db.member.create({
      data: {
        firstName: "Seated",
        lastName: "Member",
        language: [],
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const { guest, request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id], "approve")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.resolved).toBe(0)
    expect(result.data.failed[0].reason).toBe("the DGroup is at its member limit")

    const untouched = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
    expect(untouched?.status).toBe("Pending")
    expect((await db.guest.findUnique({ where: { id: guest.id } }))?.memberId).toBeNull()
  })

  it("denies past the member limit — capacity only gates joining", async () => {
    const { group } = await seedLeaderAndGroup({ memberLimit: 1 })
    await db.member.create({
      data: {
        firstName: "Seated",
        lastName: "Member",
        language: [],
        dateJoined: new Date(),
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const { request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id], "deny")
    expect(result.success && result.data.resolved).toBe(1)
  })

  it("reports an id that no longer exists instead of failing the batch", async () => {
    const { group } = await seedLeaderAndGroup()
    const { request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id, "deleted-request"], "approve")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.resolved).toBe(1)
    expect(result.data.failed).toEqual([
      { id: "deleted-request", name: "Unknown", reason: "no longer exists" },
    ])
  })

  it("is a no-op for an empty selection", async () => {
    const result = await resolveMemberRequestsBatch([], "approve")
    expect(result).toEqual({ success: true, data: { resolved: 0, failed: [] } })
  })

  it("promotes each person once when the same request id is selected twice", async () => {
    const { group } = await seedLeaderAndGroup()
    const { request } = await seedGuestRequest(group.id)

    const result = await resolveMemberRequestsBatch([request.id, request.id], "approve")

    expect(result.success && result.data.resolved).toBe(1)
    // Leader + exactly one promoted member — never a duplicate person.
    expect(await db.member.count()).toBe(2)
  })

  it("refuses a user without SmallGroups write permission", async () => {
    const { group } = await seedLeaderAndGroup()
    const { request } = await seedGuestRequest(group.id)

    mockAuth.mockResolvedValueOnce(session("Staff", "staff"))

    const result = await resolveMemberRequestsBatch([request.id], "approve")
    expect(result).toEqual({ success: false, error: "Unauthorized." })
    expect(
      (await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } }))?.status
    ).toBe("Pending")
  })
})
