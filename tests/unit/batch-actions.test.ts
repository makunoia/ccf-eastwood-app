import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { Prisma } from "@/app/generated/prisma/client"
import { runBatchDelete } from "@/lib/batch"
import {
  deleteGuestsBatch,
  setGuestsLifeStageBatch,
} from "@/app/(dashboard)/guests/actions"
import {
  deleteMembersBatch,
  setMembersLifeStageBatch,
} from "@/app/(dashboard)/members/actions"
import {
  deleteSmallGroupsBatch,
  setSmallGroupsLifeStageBatch,
} from "@/app/(dashboard)/small-groups/actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "Volunteer", "CommitteeRole", "VolunteerCommittee", "SmallGroupMemberRequest", "SmallGroupLog", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── runBatchDelete (pure helper) ────────────────────────────────────────────

describe("runBatchDelete", () => {
  it("reports per-row results and maps FK violations to the friendly reason", async () => {
    const names = new Map([
      ["a", "Alpha"],
      ["b", "Bravo"],
      ["c", "Charlie"],
    ])

    const result = await runBatchDelete({
      ids: ["a", "b", "c"],
      names,
      fkReason: "has linked records",
      deleteOne: async (id) => {
        if (id === "b") {
          throw new Prisma.PrismaClientKnownRequestError("FK", {
            code: "P2003",
            clientVersion: "test",
          })
        }
      },
    })

    expect(result.deleted).toBe(2)
    expect(result.failed).toEqual([
      { id: "b", name: "Bravo", reason: "has linked records" },
    ])
  })

  it("uses a generic reason for non-FK errors", async () => {
    const result = await runBatchDelete({
      ids: ["x"],
      names: new Map([["x", "Xray"]]),
      fkReason: "has linked records",
      deleteOne: async () => {
        throw new Error("boom")
      },
    })

    expect(result.deleted).toBe(0)
    expect(result.failed[0].reason).toBe("could not be deleted")
  })
})

// ─── Guests ──────────────────────────────────────────────────────────────────

describe("deleteGuestsBatch", () => {
  it("deletes the selected guests and leaves the rest", async () => {
    const a = await db.guest.create({ data: { firstName: "A", lastName: "G", language: [] } })
    const b = await db.guest.create({ data: { firstName: "B", lastName: "G", language: [] } })
    const c = await db.guest.create({ data: { firstName: "C", lastName: "G", language: [] } })

    const result = await deleteGuestsBatch([a.id, b.id])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deleted).toBe(2)
      expect(result.data.failed).toHaveLength(0)
    }
    const remaining = await db.guest.findMany({ select: { id: true } })
    expect(remaining.map((g) => g.id)).toEqual([c.id])
  })

  it("is a no-op for an empty selection", async () => {
    const result = await deleteGuestsBatch([])
    expect(result).toEqual({ success: true, data: { deleted: 0, failed: [] } })
  })
})

describe("setGuestsLifeStageBatch", () => {
  it("sets the life stage on the selected guests only, and can clear it", async () => {
    const ls = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
    const a = await db.guest.create({ data: { firstName: "A", lastName: "G", language: [] } })
    const b = await db.guest.create({ data: { firstName: "B", lastName: "G", language: [] } })

    const set = await setGuestsLifeStageBatch([a.id], ls.id)
    expect(set.success).toBe(true)
    if (set.success) expect(set.data.updated).toBe(1)

    expect((await db.guest.findUnique({ where: { id: a.id } }))?.lifeStageId).toBe(ls.id)
    expect((await db.guest.findUnique({ where: { id: b.id } }))?.lifeStageId).toBeNull()

    const clear = await setGuestsLifeStageBatch([a.id], null)
    expect(clear.success).toBe(true)
    expect((await db.guest.findUnique({ where: { id: a.id } }))?.lifeStageId).toBeNull()
  })
})

// ─── Members ─────────────────────────────────────────────────────────────────

async function seedMemberWithVolunteer() {
  const member = await db.member.create({
    data: { firstName: "Vol", lastName: "M", dateJoined: new Date(), language: [] },
  })
  const event = await db.event.create({
    data: { name: "E", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "C", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "R", committeeId: committee.id },
  })
  await db.volunteer.create({
    data: {
      memberId: member.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })
  return member
}

describe("deleteMembersBatch", () => {
  it("returns partial success when a member has linked records", async () => {
    const linked = await seedMemberWithVolunteer()
    const free = await db.member.create({
      data: { firstName: "Free", lastName: "M", dateJoined: new Date(), language: [] },
    })

    const result = await deleteMembersBatch([linked.id, free.id])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deleted).toBe(1)
      expect(result.data.failed).toHaveLength(1)
      expect(result.data.failed[0].id).toBe(linked.id)
      expect(result.data.failed[0].reason).toBe(
        "leads a small group or has linked records"
      )
    }

    // The free member is gone; the linked one is kept.
    expect(await db.member.findUnique({ where: { id: free.id } })).toBeNull()
    expect(await db.member.findUnique({ where: { id: linked.id } })).not.toBeNull()
  })
})

describe("setMembersLifeStageBatch", () => {
  it("updates only the selected members", async () => {
    const ls = await db.lifeStage.create({ data: { name: "Adult", order: 1 } })
    const a = await db.member.create({
      data: { firstName: "A", lastName: "M", dateJoined: new Date(), language: [] },
    })
    const b = await db.member.create({
      data: { firstName: "B", lastName: "M", dateJoined: new Date(), language: [] },
    })

    const result = await setMembersLifeStageBatch([a.id], ls.id)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)

    expect((await db.member.findUnique({ where: { id: a.id } }))?.lifeStageId).toBe(ls.id)
    expect((await db.member.findUnique({ where: { id: b.id } }))?.lifeStageId).toBeNull()
  })
})

// ─── Small Groups ────────────────────────────────────────────────────────────

describe("deleteSmallGroupsBatch / setSmallGroupsLifeStageBatch", () => {
  it("deletes selected groups", async () => {
    const a = await db.smallGroup.create({ data: { name: "Group A" } })
    const b = await db.smallGroup.create({ data: { name: "Group B" } })

    const result = await deleteSmallGroupsBatch([a.id])
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deleted).toBe(1)

    const remaining = await db.smallGroup.findMany({ select: { id: true } })
    expect(remaining.map((g) => g.id)).toEqual([b.id])
  })

  it("sets the life stage on the selected groups", async () => {
    const ls = await db.lifeStage.create({ data: { name: "Mixed", order: 1 } })
    const a = await db.smallGroup.create({ data: { name: "Group A" } })

    const result = await setSmallGroupsLifeStageBatch([a.id], ls.id)
    expect(result.success).toBe(true)
    expect((await db.smallGroup.findUnique({ where: { id: a.id } }))?.lifeStageId).toBe(ls.id)
  })
})

// ─── Authorization ───────────────────────────────────────────────────────────

describe("authorization", () => {
  it("rejects batch actions for users without write permission", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        id: "staff",
        name: "Staff",
        email: "staff@example.com",
        username: "staff",
        role: "Staff",
        permissions: [],
        eventAccess: [],
        totpEnabled: false,
        mustChangePassword: false,
        requiresTotpSetup: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const guest = await db.guest.create({ data: { firstName: "A", lastName: "G", language: [] } })
    const result = await deleteGuestsBatch([guest.id])

    expect(result.success).toBe(false)
    expect(await db.guest.findUnique({ where: { id: guest.id } })).not.toBeNull()
  })
})
