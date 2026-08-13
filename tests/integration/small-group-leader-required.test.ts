import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { deleteMember } from "@/app/(dashboard)/members/actions"

/**
 * Every DGroup has a leader.
 *
 * SmallGroup.leaderId spent a while nullable with ON DELETE SET NULL — swept in
 * as collateral by 20260606145226, a migration about occurrence series — so
 * deleting a member silently left every group they led with nobody in charge and
 * no record of it. The column is NOT NULL again and the FK RESTRICTs; these tests
 * hold both the database constraint and the action that explains it.
 */

const TRUNCATE = `TRUNCATE
  "SmallGroupLog", "SmallGroup", "Member", "User"
  RESTART IDENTITY CASCADE`

beforeEach(async () => {
  await db.$executeRawUnsafe(TRUNCATE)
  await db.user.create({
    data: { id: "user-1", username: "super-admin", role: "SuperAdmin" },
  })
  vi.mocked(auth).mockResolvedValue({
    user: { id: "user-1", role: "SuperAdmin", permissions: [], eventAccess: [] },
  } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(firstName = "Lead") {
  return db.member.create({
    data: { firstName, lastName: "Er", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
}

describe("the database constraint", () => {
  it("refuses a group with no leader", async () => {
    await expect(
      // @ts-expect-error — leaderId is required; this asserts the DB agrees.
      db.smallGroup.create({ data: { name: "Leaderless" } })
    ).rejects.toThrow()
  })

  it("refuses to delete a member who leads a group", async () => {
    const leader = await seedMember()
    await db.smallGroup.create({ data: { name: "A", leaderId: leader.id } })

    // Straight through Prisma, bypassing the action's guard entirely.
    await expect(db.member.delete({ where: { id: leader.id } })).rejects.toThrow()
    expect(await db.member.findUnique({ where: { id: leader.id } })).not.toBeNull()
  })

  it("allows the delete once the group has a different leader", async () => {
    const outgoing = await seedMember("Out")
    const incoming = await seedMember("In")
    const group = await db.smallGroup.create({
      data: { name: "A", leaderId: outgoing.id },
      select: { id: true },
    })

    await db.smallGroup.update({
      where: { id: group.id },
      data: { leaderId: incoming.id },
    })
    expect((await deleteMember(outgoing.id)).success).toBe(true)

    const after = await db.smallGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(after.leaderId).toBe(incoming.id)
  })
})

describe("the message the admin sees", () => {
  it("names the group so they know what to reassign", async () => {
    const leader = await seedMember()
    await db.smallGroup.create({ data: { name: "Tuesday Nights", leaderId: leader.id } })

    const result = await deleteMember(leader.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("Tuesday Nights")
    expect(result.error).toContain("Assign a new leader")
  })

  it("names every group when they lead more than one", async () => {
    const leader = await seedMember()
    await db.smallGroup.create({ data: { name: "Alpha", leaderId: leader.id } })
    await db.smallGroup.create({ data: { name: "Beta", leaderId: leader.id } })

    const result = await deleteMember(leader.id)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain("2 DGroups")
    expect(result.error).toContain("Alpha")
    expect(result.error).toContain("Beta")
  })
})
