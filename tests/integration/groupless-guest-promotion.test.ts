import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"

/**
 * Promoting a guest to a member without a DGroup.
 *
 * Joining a DGroup used to be the only way to become a member, which left admins
 * unable to record someone who plainly is one but isn't in a group yet. The group
 * is now optional, the date joined is the admin's to choose, and any DGroup
 * request the guest was waiting on gets answered rather than left dangling.
 */

const TRUNCATE = `TRUNCATE
  "SmallGroupMemberRequest", "SmallGroupLog", "SmallGroup", "Member", "Guest",
  "AgeRangeBucket", "FamilyMember", "Family", "EventRegistrant", "Event",
  "SchedulePreference", "User"
  RESTART IDENTITY CASCADE`

const superAdmin = {
  user: { id: "user-1", role: "SuperAdmin", permissions: [], eventAccess: [] },
}

/** A staff user with write on Guests but not on DGroups. */
const guestsOnlyStaff = {
  user: {
    id: "user-2",
    role: "Staff",
    permissions: [{ feature: "Guests", actions: ["Read", "Write"] }],
    eventAccess: [],
  },
}

function actAs(session: unknown) {
  vi.mocked(auth).mockResolvedValue(session as Awaited<ReturnType<typeof auth>>)
}

async function seedGuest(overrides: Record<string, unknown> = {}) {
  return db.guest.create({
    data: {
      firstName: "Ella",
      lastName: "Santos",
      nickname: "Ellie",
      phone: "+63 917 222 3333",
      language: ["en"],
      workCity: "Quezon City",
      ...overrides,
    },
    select: { id: true },
  })
}

async function seedGroup(overrides: Record<string, unknown> = {}) {
  const leader = await db.member.create({
    data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
  return db.smallGroup.create({
    data: { name: "Group A", leaderId: leader.id, status: "Active", ...overrides },
    select: { id: true, status: true },
  })
}

async function memberFor(guestId: string) {
  const guest = await db.guest.findUniqueOrThrow({
    where: { id: guestId },
    select: { memberId: true },
  })
  expect(guest.memberId).not.toBeNull()
  return db.member.findUniqueOrThrow({ where: { id: guest.memberId! } })
}

beforeEach(async () => {
  await db.$executeRawUnsafe(TRUNCATE)
  // SmallGroupLog.performedByUserId is a real FK — the acting user has to exist.
  await db.user.createMany({
    data: [
      { id: "user-1", username: "super-admin", role: "SuperAdmin" },
      { id: "user-2", username: "guests-staff", role: "Staff" },
    ],
  })
  actAs(superAdmin)
})

afterAll(async () => {
  await db.$disconnect()
})

describe("promoting without a DGroup", () => {
  it("creates a member with no group and no group status", async () => {
    const guest = await seedGuest()

    const result = await promoteGuestToMember(guest.id)
    expect(result.success).toBe(true)

    const member = await memberFor(guest.id)
    expect(member.smallGroupId).toBeNull()
    // Not a defaulted "Member" — they aren't in a group to be a member of.
    expect(member.groupStatus).toBeNull()
  })

  it("carries the guest's profile onto the new member", async () => {
    const guest = await seedGuest({ email: "ella@example.com", workIndustry: "Healthcare" })

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    expect(member).toMatchObject({
      firstName: "Ella",
      lastName: "Santos",
      nickname: "Ellie",
      email: "ella@example.com",
      phone: "+63 917 222 3333",
      workCity: "Quezon City",
      workIndustry: "Healthcare",
    })
  })

  it("keeps the guest row as history, linked to the new member", async () => {
    const guest = await seedGuest()
    await promoteGuestToMember(guest.id)

    const row = await db.guest.findUnique({ where: { id: guest.id } })
    expect(row).not.toBeNull()
    expect(row!.memberId).not.toBeNull()
  })
})

describe("date joined", () => {
  it("uses the supplied date", async () => {
    const guest = await seedGuest()

    expect(
      (await promoteGuestToMember(guest.id, null, { dateJoined: "2026-03-15" })).success
    ).toBe(true)

    const member = await memberFor(guest.id)
    expect(member.dateJoined.toISOString()).toBe("2026-03-15T00:00:00.000Z")
  })

  it("defaults to today when a caller omits it", async () => {
    const guest = await seedGuest()
    const group = await seedGroup()

    // The legacy two-argument call, still used by the DGroup form.
    expect((await promoteGuestToMember(guest.id, group.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    expect(member.dateJoined.toISOString().slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10)
    )
  })

  it("rejects a blank date rather than inventing one", async () => {
    const guest = await seedGuest()

    const result = await promoteGuestToMember(guest.id, null, { dateJoined: "" })
    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })
})

describe("guards", () => {
  it("refuses a guest who is already a member", async () => {
    const guest = await seedGuest()
    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const second = await promoteGuestToMember(guest.id)
    expect(second).toEqual({
      success: false,
      error: "Guest has already been promoted to a member",
    })
    expect(await db.member.count()).toBe(1)
  })

  it("refuses a groupId that doesn't exist", async () => {
    const guest = await seedGuest()

    const result = await promoteGuestToMember(guest.id, "no-such-group")
    expect(result).toEqual({ success: false, error: "DGroup not found" })
    expect(await db.member.count()).toBe(0)
  })

  it("refuses a full group but still allows the same guest through with no group", async () => {
    const group = await seedGroup({ memberLimit: 1 })
    await db.member.create({
      data: {
        firstName: "Already",
        lastName: "In",
        dateJoined: new Date(),
        language: [],
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const guest = await seedGuest()

    const blocked = await promoteGuestToMember(guest.id, group.id)
    expect(blocked.success).toBe(false)
    expect(blocked).toHaveProperty("error", "This group has reached its member limit of 1")

    // The capacity gate belongs to the placement, not to the promotion.
    expect((await promoteGuestToMember(guest.id)).success).toBe(true)
    const member = await memberFor(guest.id)
    expect(member.smallGroupId).toBeNull()
  })

  it("refuses a duplicate email before creating anything", async () => {
    await db.member.create({
      data: {
        firstName: "Same",
        lastName: "Email",
        email: "clash@example.com",
        dateJoined: new Date(),
        language: [],
      },
    })
    const guest = await seedGuest({ email: "clash@example.com", phone: null })

    const result = await promoteGuestToMember(guest.id)
    expect(result.success).toBe(false)
    // One member — the pre-existing one. No orphan was created and rolled back.
    expect(await db.member.count()).toBe(1)
    const row = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(row.memberId).toBeNull()
  })

  it("refuses a duplicate phone before creating anything", async () => {
    await db.guest.create({
      data: { firstName: "Other", lastName: "Guest", phone: "+63 917 222 3333", language: [] },
    })
    const guest = await seedGuest()

    const result = await promoteGuestToMember(guest.id)
    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })
})

describe("references follow the person", () => {
  it("repoints event registrations off the guest identity", async () => {
    const guest = await seedGuest()
    const event = await db.event.create({
      data: {
        name: "Retreat",
        type: "OneTime",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-01"),
      },
      select: { id: true },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
    expect(registrants).toHaveLength(1)
    expect(registrants[0].guestId).toBeNull()
    expect(registrants[0].memberId).toBe(member.id)
  })

  it("repoints family membership without losing the role", async () => {
    const guest = await seedGuest()
    const family = await db.family.create({ data: { name: "Santos" }, select: { id: true } })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: guest.id, role: "MotherWife" },
    })

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(1)
    expect(links[0].guestId).toBeNull()
    expect(links[0].memberId).toBe(member.id)
    expect(links[0].role).toBe("MotherWife")
  })

  it("carries the guest's availability into a schedule preference", async () => {
    const guest = await seedGuest({
      scheduleDayOfWeek: 2,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    const prefs = await db.schedulePreference.findMany({ where: { memberId: member.id } })
    expect(prefs).toHaveLength(1)
    expect(prefs[0]).toMatchObject({ dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" })
  })
})

describe("group placement", () => {
  it("wakes a Pending group when someone is placed in it", async () => {
    const group = await seedGroup({ status: "Pending" })
    const guest = await seedGuest()

    expect((await promoteGuestToMember(guest.id, group.id)).success).toBe(true)

    const after = await db.smallGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(after.status).toBe("Active")
  })

  it("leaves a Pending group alone when the promotion has no group", async () => {
    const group = await seedGroup({ status: "Pending" })
    const guest = await seedGuest()

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const after = await db.smallGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(after.status).toBe("Pending")
  })
})

describe("pending DGroup requests", () => {
  async function seedPendingRequest(guestId: string, smallGroupId: string) {
    return db.smallGroupMemberRequest.create({
      data: { smallGroupId, guestId, status: "Pending" },
      select: { id: true },
    })
  }

  it("confirms the request when the admin promotes into that same group", async () => {
    const group = await seedGroup()
    const guest = await seedGuest()
    const req = await seedPendingRequest(guest.id, group.id)

    expect((await promoteGuestToMember(guest.id, group.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    const after = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: req.id } })
    expect(after.status).toBe("Confirmed")
    expect(after.resolvedAt).not.toBeNull()
    expect(after.memberId).toBe(member.id)
    expect(after.guestId).toBeNull()
  })

  it("rejects the request when the admin promotes into a different group", async () => {
    const groupA = await seedGroup({ name: "Group A" })
    const groupB = await seedGroup({ name: "Group B" })
    const guest = await seedGuest()
    const req = await seedPendingRequest(guest.id, groupA.id)

    expect((await promoteGuestToMember(guest.id, groupB.id)).success).toBe(true)

    const after = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: req.id } })
    // One group per member — the request for Group A can no longer be met.
    expect(after.status).toBe("Rejected")
    expect(after.guestId).toBeNull()
  })

  it("rejects the request when the admin promotes with no group at all", async () => {
    const group = await seedGroup()
    const guest = await seedGuest()
    const req = await seedPendingRequest(guest.id, group.id)

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const after = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: req.id } })
    expect(after.status).toBe("Rejected")
  })

  it("records the resolution in the group's log", async () => {
    const group = await seedGroup()
    const guest = await seedGuest()
    await seedPendingRequest(guest.id, group.id)

    await promoteGuestToMember(guest.id, group.id)

    const logs = await db.smallGroupLog.findMany({ where: { smallGroupId: group.id } })
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe("TempAssignmentConfirmed")
    expect(logs[0].performedByUserId).toBe("user-1")
  })

  it("leaves a seeker request open — being promoted doesn't find them a group", async () => {
    const guest = await seedGuest()
    const req = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, status: "Pending", origin: "RegistrationIntent" },
      select: { id: true },
    })

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)

    const member = await memberFor(guest.id)
    const after = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: req.id } })
    expect(after.status).toBe("Pending")
    // Still repointed, so the queue doesn't refer to an identity they've left.
    expect(after.memberId).toBe(member.id)
    expect(after.guestId).toBeNull()
  })
})

describe("permissions", () => {
  it("lets a Guests-only staffer promote without a group", async () => {
    const guest = await seedGuest()
    actAs(guestsOnlyStaff)

    expect((await promoteGuestToMember(guest.id)).success).toBe(true)
  })

  it("stops a Guests-only staffer from placing someone in a DGroup", async () => {
    const group = await seedGroup()
    const guest = await seedGuest()
    actAs(guestsOnlyStaff)

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result).toEqual({ success: false, error: "Unauthorized." })
    expect(await db.guest.count({ where: { memberId: { not: null } } })).toBe(0)
  })

  it("rejects an unauthenticated caller", async () => {
    const guest = await seedGuest()
    actAs(null)

    const result = await promoteGuestToMember(guest.id)
    expect(result).toEqual({ success: false, error: "Not authenticated." })
  })
})
