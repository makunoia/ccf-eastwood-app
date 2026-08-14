import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  addMemberToGroup,
  addCoupleToGroup,
  createSmallGroup,
  updateSmallGroup,
  updateMemberGroupStatus,
} from "@/app/(dashboard)/small-groups/actions"
import { deleteMember, deleteMembersBatch } from "@/app/(dashboard)/members/actions"

/**
 * A member belongs to at most one DGroup, so placing them somewhere new also
 * removes them from wherever they were. Every one of these paths used to record
 * only the arrival, leaving the origin group's history showing a roster that
 * shrank for no stated reason.
 */

const TRUNCATE = `TRUNCATE
  "SmallGroupMemberRequest", "SmallGroupLog", "SmallGroup", "Member", "Guest",
  "Family", "FamilyMember", "SchedulePreference", "LifeStage", "User"
  RESTART IDENTITY CASCADE`

const superAdmin = {
  user: { id: "user-1", role: "SuperAdmin", permissions: [], eventAccess: [] },
}

/** Must be a real entry in lib/constants/ccf-satellites.ts — the schema validates it. */
const SATELLITE = "CCF Alabang"

beforeEach(async () => {
  await db.$executeRawUnsafe(TRUNCATE)
  await db.user.create({
    data: { id: "user-1", username: "super-admin", role: "SuperAdmin" },
  })
  vi.mocked(auth).mockResolvedValue(superAdmin as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Ella",
      lastName: "Santos",
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
    select: { id: true },
  })
}

async function seedGroup(name: string, overrides: Record<string, unknown> = {}) {
  const leader = await db.member.create({
    data: { firstName: `Lead${name}`, lastName: "Er", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
  const group = await db.smallGroup.create({
    data: { name, leaderId: leader.id, status: "Active", ...overrides },
    select: { id: true },
  })
  return { ...group, leaderId: leader.id }
}

async function logsFor(smallGroupId: string) {
  return db.smallGroupLog.findMany({
    where: { smallGroupId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * A payload the DGroup form schema accepts. `lifeStageIds` needs at least one
 * entry and `scheduleDayOfWeek` is required, so both are seeded rather than left
 * blank; `parentScope` picks which of parentGroupId/parentSatellite survives.
 */
async function groupForm(overrides: Record<string, unknown>) {
  const lifeStage = await db.lifeStage.upsert({
    where: { name: "Young Pro" },
    update: {},
    create: { name: "Young Pro", order: 1 },
    select: { id: true },
  })
  return {
    name: "Child",
    parentScope: "none",
    // The nullable* helpers are `z.string().optional()` — they take "" or
    // undefined, never null. Passing null fails validation before any action runs.
    parentGroupId: "",
    parentSatellite: "",
    groupType: "Regular",
    lifeStageIds: [lifeStage.id],
    genderFocus: "Mixed",
    language: [],
    ageRangeMin: "",
    ageRangeMax: "",
    meetingFormat: "InPerson",
    locationCity: "",
    memberLimit: "",
    scheduleDayOfWeek: "3",
    scheduleTimeStart: "",
    scheduleTimeEnd: "",
    ...overrides,
  } as unknown as Parameters<typeof createSmallGroup>[0]
}

describe("addMemberToGroup", () => {
  it("logs a plain arrival when the member had no group", async () => {
    const group = await seedGroup("A")
    const member = await seedMember()

    expect((await addMemberToGroup(group.id, member.id)).success).toBe(true)

    const logs = await logsFor(group.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe("MemberAdded")
  })

  it("logs both sides when the member came from another group", async () => {
    const from = await seedGroup("From")
    const to = await seedGroup("To")
    const member = await seedMember({ smallGroupId: from.id, groupStatus: "Member" })

    expect((await addMemberToGroup(to.id, member.id)).success).toBe(true)

    // The gap: the origin group used to record nothing at all.
    const outbound = await logsFor(from.id)
    expect(outbound).toHaveLength(1)
    expect(outbound[0]).toMatchObject({
      action: "MemberTransferred",
      memberId: member.id,
      fromGroupId: from.id,
      toGroupId: to.id,
    })
    expect(outbound[0].description).toContain("out of this group")

    const inbound = await logsFor(to.id)
    expect(inbound).toHaveLength(1)
    expect(inbound[0].action).toBe("MemberTransferred")
    expect(inbound[0].description).toContain("into this group")
  })

  it("attributes the move to the acting admin", async () => {
    const from = await seedGroup("From")
    const to = await seedGroup("To")
    const member = await seedMember({ smallGroupId: from.id, groupStatus: "Member" })

    await addMemberToGroup(to.id, member.id)

    const all = [...(await logsFor(from.id)), ...(await logsFor(to.id))]
    expect(all.every((l) => l.performedByUserId === "user-1")).toBe(true)
  })

  it("writes nothing when re-adding someone already in the group", async () => {
    const group = await seedGroup("A")
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Member" })

    expect((await addMemberToGroup(group.id, member.id)).success).toBe(true)

    expect(await logsFor(group.id)).toHaveLength(0)
  })

  it("still moves the member itself, not just the log", async () => {
    const from = await seedGroup("From")
    const to = await seedGroup("To")
    const member = await seedMember({ smallGroupId: from.id, groupStatus: "Member" })

    await addMemberToGroup(to.id, member.id)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.smallGroupId).toBe(to.id)
    expect(after.groupStatus).toBe("Member")
  })
})

describe("addCoupleToGroup", () => {
  it("logs each spouse's departure from their own previous group", async () => {
    const hers = await seedGroup("Hers")
    const his = await seedGroup("His")
    const target = await seedGroup("Couples")
    const wife = await seedMember({
      firstName: "Ella",
      smallGroupId: hers.id,
      groupStatus: "Member",
    })
    const husband = await seedMember({
      firstName: "Marco",
      smallGroupId: his.id,
      groupStatus: "Member",
    })

    expect((await addCoupleToGroup(target.id, wife.id, husband.id)).success).toBe(true)

    expect(await logsFor(hers.id)).toHaveLength(1)
    expect(await logsFor(his.id)).toHaveLength(1)
    const inbound = await logsFor(target.id)
    expect(inbound).toHaveLength(2)
    expect(inbound.every((l) => l.description?.endsWith("(couple)"))).toBe(true)
  })

  it("logs a plain arrival for a spouse who had no group", async () => {
    const hers = await seedGroup("Hers")
    const target = await seedGroup("Couples")
    const wife = await seedMember({ smallGroupId: hers.id, groupStatus: "Member" })
    const husband = await seedMember({ firstName: "Marco" })

    await addCoupleToGroup(target.id, wife.id, husband.id)

    const inbound = await logsFor(target.id)
    const actions = inbound.map((l) => l.action).sort()
    expect(actions).toEqual(["MemberAdded", "MemberTransferred"])
  })
})

describe("leader auto-placement into the parent group", () => {
  it("logs the leader joining the parent when a group is created under it", async () => {
    const parent = await seedGroup("Parent")
    const leader = await seedMember({ firstName: "Nina" })

    const result = await createSmallGroup(
      await groupForm({
        leaderId: leader.id,
        parentScope: "group",
        parentGroupId: parent.id,
      })
    )
    expect(result.success).toBe(true)

    // The placement used to happen with no entry in the parent's history.
    const logs = await logsFor(parent.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: "MemberAdded", memberId: leader.id })
    expect(logs[0].description).toContain("leader of")
  })

  it("logs the leader's departure when the parent becomes an outside satellite", async () => {
    const parent = await seedGroup("Parent")
    const leader = await seedMember({
      firstName: "Nina",
      smallGroupId: parent.id,
      groupStatus: "Member",
    })
    const child = await db.smallGroup.create({
      data: {
        name: "Child",
        leaderId: leader.id,
        parentGroupId: parent.id,
        status: "Active",
      },
      select: { id: true },
    })

    const result = await updateSmallGroup(
      child.id,
      await groupForm({
        leaderId: leader.id,
        parentScope: "satellite",
        parentSatellite: SATELLITE,
      })
    )
    expect(result.success).toBe(true)

    const logs = await logsFor(parent.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: "MemberRemoved", memberId: leader.id })

    const after = await db.member.findUniqueOrThrow({ where: { id: leader.id } })
    expect(after.smallGroupId).toBeNull()
  })

  it("logs nothing when the scoped removal matches nobody", async () => {
    const parent = await seedGroup("Parent")
    const elsewhere = await seedGroup("Elsewhere")
    // The leader was hand-placed in a different group, so the satellite move must
    // neither touch that membership nor invent a departure from the old parent.
    const leader = await seedMember({
      firstName: "Nina",
      smallGroupId: elsewhere.id,
      groupStatus: "Member",
    })
    const child = await db.smallGroup.create({
      data: {
        name: "Child",
        leaderId: leader.id,
        parentGroupId: parent.id,
        status: "Active",
      },
      select: { id: true },
    })

    await updateSmallGroup(
      child.id,
      await groupForm({
        leaderId: leader.id,
        parentScope: "satellite",
        parentSatellite: SATELLITE,
      })
    )

    expect(await logsFor(parent.id)).toHaveLength(0)
    const after = await db.member.findUniqueOrThrow({ where: { id: leader.id } })
    expect(after.smallGroupId).toBe(elsewhere.id)
  })
})

describe("deleting a member", () => {
  it("records the departure before the row disappears", async () => {
    const group = await seedGroup("A")
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Member" })

    expect((await deleteMember(member.id)).success).toBe(true)

    const logs = await logsFor(group.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe("MemberRemoved")
    // SmallGroupLog.memberId is ON DELETE SET NULL, so the link is gone and the
    // description is the only thing still naming them. That's why it carries one.
    expect(logs[0].memberId).toBeNull()
    expect(logs[0].description).toContain("Ella Santos")
    expect(logs[0].description).toContain("deleted")
  })

  it("writes no group log for a member who was in no group", async () => {
    const group = await seedGroup("A")
    const member = await seedMember()

    expect((await deleteMember(member.id)).success).toBe(true)

    expect(await logsFor(group.id)).toHaveLength(0)
  })

  it("records a departure for every member in a batch delete", async () => {
    const group = await seedGroup("A")
    const one = await seedMember({ firstName: "Ella", smallGroupId: group.id, groupStatus: "Member" })
    const two = await seedMember({ firstName: "Marco", smallGroupId: group.id, groupStatus: "Member" })

    const result = await deleteMembersBatch([one.id, two.id])
    expect(result.success).toBe(true)

    const logs = await logsFor(group.id)
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.action === "MemberRemoved")).toBe(true)
    const named = logs.map((l) => l.description ?? "").join(" ")
    expect(named).toContain("Ella")
    expect(named).toContain("Marco")
  })

  it("leaves no log behind when the delete fails", async () => {
    const group = await seedGroup("A")

    const result = await deleteMember("no-such-member")
    expect(result.success).toBe(false)

    // The log write and the delete share a transaction, so a failed delete must
    // not leave a departure recorded for someone still in the group.
    expect(await logsFor(group.id)).toHaveLength(0)
  })

  it("refuses to delete a member who leads a group, naming it", async () => {
    const home = await seedGroup("Home")
    const led = await seedGroup("Led")
    // A leader is simultaneously a member of another group — upward accountability.
    await db.member.update({
      where: { id: led.leaderId },
      data: { smallGroupId: home.id, groupStatus: "Leader" },
    })

    const result = await deleteMember(led.leaderId)
    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error", expect.stringContaining('"Led"'))

    // Nothing happened: no departure logged, and the member is still here.
    expect(await logsFor(home.id)).toHaveLength(0)
    expect(await db.member.findUnique({ where: { id: led.leaderId } })).not.toBeNull()
  })

  it("keeps the rest of a batch when one member turns out to lead a group", async () => {
    const group = await seedGroup("A")
    const led = await seedGroup("Led")
    const ordinary = await seedMember({
      firstName: "Ella",
      smallGroupId: group.id,
      groupStatus: "Member",
    })

    const result = await deleteMembersBatch([ordinary.id, led.leaderId])
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.deleted).toBe(1)
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].reason).toContain('"Led"')

    expect(await db.member.findUnique({ where: { id: ordinary.id } })).toBeNull()
    expect(await db.member.findUnique({ where: { id: led.leaderId } })).not.toBeNull()
  })
})

describe("leader changes", () => {
  it("logs the handover, naming both leaders", async () => {
    const group = await seedGroup("A")
    const incoming = await seedMember({ firstName: "Nina", lastName: "Reyes" })
    const outgoingId = group.leaderId

    const result = await updateSmallGroup(
      group.id,
      await groupForm({ name: "A", leaderId: incoming.id })
    )
    expect(result.success).toBe(true)

    const logs = await logsFor(group.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      action: "LeaderChanged",
      memberId: incoming.id,
      performedByUserId: "user-1",
    })
    expect(logs[0].description).toContain("Nina Reyes")
    expect(logs[0].description).toContain("LeadA Er")

    const after = await db.smallGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(after.leaderId).toBe(incoming.id)
    // The outgoing leader is only named in the description — they have no column.
    expect(outgoingId).not.toBe(after.leaderId)
  })

  it("writes nothing when the form is re-saved with the same leader", async () => {
    const group = await seedGroup("A")

    const result = await updateSmallGroup(
      group.id,
      await groupForm({ name: "A", leaderId: group.leaderId })
    )
    expect(result.success).toBe(true)

    expect(await logsFor(group.id)).toHaveLength(0)
  })
})

describe("group status changes", () => {
  it("records a member moving from Member to Timothy", async () => {
    const group = await seedGroup("A")
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Member" })

    const result = await updateMemberGroupStatus(member.id, group.id, "Timothy")
    expect(result.success).toBe(true)

    const logs = await logsFor(group.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      action: "MemberStatusChanged",
      memberId: member.id,
      performedByUserId: "user-1",
    })
    expect(logs[0].description).toBe("Ella Santos changed from Member to Timothy")

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.groupStatus).toBe("Timothy")
  })

  it("reads as an initial setting when they had no standing", async () => {
    const group = await seedGroup("A")
    const member = await seedMember({ smallGroupId: group.id })

    await updateMemberGroupStatus(member.id, group.id, "Leader")

    const logs = await logsFor(group.id)
    expect(logs[0].description).toBe("Ella Santos was set to Leader")
  })

  it("writes nothing when the same status is re-selected", async () => {
    const group = await seedGroup("A")
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Timothy" })

    const result = await updateMemberGroupStatus(member.id, group.id, "Timothy")
    expect(result.success).toBe(true)

    expect(await logsFor(group.id)).toHaveLength(0)
  })
})
