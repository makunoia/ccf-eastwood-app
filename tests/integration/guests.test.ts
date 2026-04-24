import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  createGuest,
  updateGuest,
  deleteGuest,
  promoteGuestToMember,
} from "@/app/(dashboard)/guests/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "SmallGroupLog", "SmallGroupMemberRequest", "SmallGroup", "Guest", "Member", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const BASE_GUEST_FORM = {
  firstName: "Jane",
  lastName: "Doe",
  email: "",
  phone: "",
  notes: "",
  lifeStageId: "",
  gender: "",
  language: [] as string[],
  birthMonth: "",
  birthYear: "",
  workCity: "",
  workIndustry: "",
  meetingPreference: "",
}

async function seedLeader() {
  return db.member.create({
    data: { firstName: "Leader", lastName: "Test", dateJoined: new Date() },
    select: { id: true },
  })
}

async function seedGroup(leaderId: string, overrides: { memberLimit?: number } = {}) {
  return db.smallGroup.create({
    data: { name: "Test Group", leaderId, ...overrides },
    select: { id: true },
  })
}

describe("createGuest", () => {
  it("creates a guest and returns its id", async () => {
    const result = await createGuest(BASE_GUEST_FORM)
    expect(result.success).toBe(true)
    if (!result.success) return

    const guest = await db.guest.findUnique({ where: { id: result.data.id } })
    expect(guest?.firstName).toBe("Jane")
    expect(guest?.lastName).toBe("Doe")
    expect(guest?.email).toBeNull()
    expect(guest?.memberId).toBeNull()
  })

  it("stores all optional fields correctly", async () => {
    const result = await createGuest({
      ...BASE_GUEST_FORM,
      email: "jane@example.com",
      phone: "09171234567",
      gender: "Female",
      language: ["Filipino"],
      birthMonth: "5",
      birthYear: "1995",
      workCity: "BGC",
      workIndustry: "Tech",
      meetingPreference: "Online",
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const guest = await db.guest.findUnique({ where: { id: result.data.id } })
    expect(guest?.email).toBe("jane@example.com")
    expect(guest?.phone).toBe("09171234567")
    expect(guest?.gender).toBe("Female")
    expect(guest?.birthMonth).toBe(5)
    expect(guest?.birthYear).toBe(1995)
    expect(guest?.language).toEqual(["Filipino"])
    expect(guest?.meetingPreference).toBe("Online")
  })

  it("returns a validation error for empty firstName", async () => {
    const result = await createGuest({ ...BASE_GUEST_FORM, firstName: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("First name is required")
  })

  it("returns a validation error for invalid email", async () => {
    const result = await createGuest({ ...BASE_GUEST_FORM, email: "bad-email" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Invalid email address")
  })
})

describe("updateGuest", () => {
  it("updates an existing guest's fields", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const result = await updateGuest(guest.id, {
      ...BASE_GUEST_FORM,
      firstName: "Janet",
      email: "janet@example.com",
    })
    expect(result.success).toBe(true)

    const updated = await db.guest.findUnique({ where: { id: guest.id } })
    expect(updated?.firstName).toBe("Janet")
    expect(updated?.email).toBe("janet@example.com")
  })

  it("clears optional fields when passed empty strings", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", phone: "09171234567", language: [] },
      select: { id: true },
    })

    await updateGuest(guest.id, { ...BASE_GUEST_FORM, phone: "" })

    const updated = await db.guest.findUnique({ where: { id: guest.id } })
    expect(updated?.phone).toBeNull()
  })
})

describe("deleteGuest", () => {
  it("hard deletes an existing guest", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })

    const result = await deleteGuest(guest.id)
    expect(result.success).toBe(true)

    expect(await db.guest.findUnique({ where: { id: guest.id } })).toBeNull()
  })

  it("returns an error for a non-existent guest", async () => {
    const result = await deleteGuest("does-not-exist")
    expect(result.success).toBe(false)
  })
})

describe("promoteGuestToMember", () => {
  it("creates a Member from the guest's profile and links them to the group", async () => {
    const leader = await seedLeader()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "09171234567",
        gender: "Female",
        birthMonth: 5,
        birthYear: 1995,
        language: ["Filipino"],
      },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUnique({ where: { id: result.data.memberId } })
    expect(member?.firstName).toBe("Jane")
    expect(member?.email).toBe("jane@example.com")
    expect(member?.smallGroupId).toBe(group.id)
    expect(member?.groupStatus).toBe("Member")
    expect(member?.dateJoined).toBeInstanceOf(Date)

    // Guest record is retained with memberId set
    const updatedGuest = await db.guest.findUnique({ where: { id: guest.id } })
    expect(updatedGuest?.memberId).toBe(result.data.memberId)
  })

  it("migrates EventRegistrant FK from guest to new member", async () => {
    const leader = await seedLeader()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })
    const event = await db.event.create({
      data: { name: "Conf", type: "OneTime", startDate: new Date("2025-01-01"), endDate: new Date("2025-01-01") },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const updated = await db.eventRegistrant.findUnique({ where: { id: registrant.id } })
    expect(updated?.memberId).toBe(result.data.memberId)
    expect(updated?.guestId).toBeNull()
  })

  it("copies schedule preference from guest to new member when present", async () => {
    const leader = await seedLeader()
    const group = await seedGroup(leader.id)
    const guest = await db.guest.create({
      data: {
        firstName: "Jane",
        lastName: "Doe",
        language: [],
        scheduleDayOfWeek: 6,
        scheduleTimeStart: "09:00",
      },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const prefs = await db.schedulePreference.findMany({
      where: { memberId: result.data.memberId },
    })
    expect(prefs).toHaveLength(1)
    expect(prefs[0].dayOfWeek).toBe(6)
    expect(prefs[0].timeStart).toBe("09:00")
  })

  it("returns an error if the guest does not exist", async () => {
    const leader = await seedLeader()
    const group = await seedGroup(leader.id)
    const result = await promoteGuestToMember("non-existent", group.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Guest not found")
  })

  it("returns an error if the guest has already been promoted", async () => {
    const leader = await seedLeader()
    const group = await seedGroup(leader.id)
    const existingMember = await db.member.create({
      data: { firstName: "Jane", lastName: "Doe", dateJoined: new Date() },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [], memberId: existingMember.id },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Guest has already been promoted to a member")
  })

  it("returns an error if the target group does not exist", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
      select: { id: true },
    })
    const result = await promoteGuestToMember(guest.id, "non-existent-group")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Small group not found")
  })

  it("enforces the group member limit", async () => {
    const leader = await seedLeader()
    // Place leader into group to consume the one slot
    const group = await db.smallGroup.create({
      data: {
        name: "Full Group",
        leaderId: leader.id,
        memberLimit: 1,
        members: { connect: { id: leader.id } },
      },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "New", lastName: "Person", language: [] },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("member limit")
  })
})
