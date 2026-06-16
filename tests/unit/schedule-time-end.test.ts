/**
 * Tests for scheduleTimeEnd / SchedulePreference.timeEnd persistence and
 * matching engine integration.
 *
 * Key invariants verified:
 *   1. All save paths persist the end time to the DB
 *   2. The matching engine uses the stored end time (not a hardcoded +1h)
 *   3. Null timeEnd falls back to addOneHour (backwards-compat for old records)
 *   4. Guest→Member promotion carries scheduleTimeEnd into SchedulePreference
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: undefined,
      name: "Test Admin",
      email: "test@example.com",
      username: "test-admin",
      role: "SuperAdmin",
      permissions: [],
      eventAccess: [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
    },
  }),
}))

import { db } from "@/lib/db"
import { saveGuestMatchingProfile, promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import { saveMemberMatchingPreferences } from "@/app/(dashboard)/members/actions"
import { createSmallGroup, updateSmallGroup } from "@/app/(dashboard)/small-groups/actions"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"
import { createBreakoutGroup, updateBreakoutGroup } from "@/app/(dashboard)/events/breakout-actions"
import { matchSmallGroups } from "@/lib/matching"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`
    TRUNCATE
      "SchedulePreference", "SmallGroupMemberRequest", "SmallGroupLog",
      "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup",
      "Volunteer", "CommitteeRole", "VolunteerCommittee",
      "EventMinistry", "EventRegistrant", "EventOccurrence", "Event",
      "SmallGroup", "Member", "Guest", "LifeStage"
    RESTART IDENTITY CASCADE
  `
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedLifeStage() {
  return db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
}

async function seedMember(overrides: { firstName?: string } = {}) {
  return db.member.create({
    data: { firstName: overrides.firstName ?? "Leader", lastName: "Test", dateJoined: new Date(), language: [] },
  })
}

async function seedGuest(opts: { scheduleTimeStart?: string | null; scheduleTimeEnd?: string | null } = {}) {
  return db.guest.create({
    data: {
      firstName: "Test", lastName: "Guest", language: [],
      scheduleDayOfWeek: 1,
      scheduleTimeStart: opts.scheduleTimeStart ?? null,
      scheduleTimeEnd: opts.scheduleTimeEnd ?? null,
    },
  })
}

async function seedSmallGroup(leaderId: string, opts: { scheduleTimeStart?: string; scheduleTimeEnd?: string | null } = {}) {
  return db.smallGroup.create({
    data: {
      name: "Test Group", leaderId, language: [],
      scheduleDayOfWeek: 1,
      scheduleTimeStart: opts.scheduleTimeStart ?? null,
      scheduleTimeEnd: opts.scheduleTimeEnd !== undefined ? opts.scheduleTimeEnd : null,
    },
  })
}

async function seedEventWithCommitteeAndRole() {
  const event = await db.event.create({
    data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({ data: { name: "Committee", eventId: event.id } })
  const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })
  return { event, committee, role }
}

async function seedConfirmedVolunteer(eventId: string, committeeId: string, roleId: string) {
  const member = await db.member.create({
    data: { firstName: "Vol", lastName: "Member", dateJoined: new Date(), language: [] },
  })
  const vol = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId, preferredRoleId: roleId, status: "Confirmed" },
  })
  return { member, vol }
}

// ─── Part 1: Persist tests ─────────────────────────────────────────────────────

describe("saveGuestMatchingProfile — scheduleTimeEnd", () => {
  it("persists scheduleTimeEnd to the guest record", async () => {
    const guest = await seedGuest()

    await saveGuestMatchingProfile(guest.id, {
      scheduleDayOfWeek: 1,
      scheduleTimeStart: "09:00",
      scheduleTimeEnd: "10:30",
    })

    const updated = await db.guest.findUnique({ where: { id: guest.id } })
    expect(updated?.scheduleTimeStart).toBe("09:00")
    expect(updated?.scheduleTimeEnd).toBe("10:30")
  })

  it("clears scheduleTimeEnd when null is saved", async () => {
    const guest = await db.guest.create({
      data: {
        firstName: "T", lastName: "G", language: [],
        scheduleDayOfWeek: 1, scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30",
      },
    })

    await saveGuestMatchingProfile(guest.id, {
      scheduleDayOfWeek: null,
      scheduleTimeStart: null,
      scheduleTimeEnd: null,
    })

    const updated = await db.guest.findUnique({ where: { id: guest.id } })
    expect(updated?.scheduleTimeEnd).toBeNull()
  })
})

describe("saveMemberMatchingPreferences — SchedulePreference.timeEnd", () => {
  it("persists timeEnd to the SchedulePreference record", async () => {
    const member = await seedMember()

    await saveMemberMatchingPreferences(member.id, {
      lifeStageId: "", gender: "", language: [], workCity: "", workIndustry: "",
      meetingPreference: "", scheduleDayOfWeek: "1",
      scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30",
    })

    const pref = await db.schedulePreference.findFirst({ where: { memberId: member.id } })
    expect(pref?.timeStart).toBe("09:00")
    expect(pref?.timeEnd).toBe("10:30")
  })

  it("replaces existing SchedulePreference and keeps new timeEnd", async () => {
    const member = await seedMember()

    // First save
    await saveMemberMatchingPreferences(member.id, {
      lifeStageId: "", gender: "", language: [], workCity: "", workIndustry: "",
      meetingPreference: "", scheduleDayOfWeek: "1",
      scheduleTimeStart: "09:00", scheduleTimeEnd: "10:00",
    })
    // Second save with updated timeEnd
    await saveMemberMatchingPreferences(member.id, {
      lifeStageId: "", gender: "", language: [], workCity: "", workIndustry: "",
      meetingPreference: "", scheduleDayOfWeek: "1",
      scheduleTimeStart: "09:00", scheduleTimeEnd: "11:00",
    })

    const prefs = await db.schedulePreference.findMany({ where: { memberId: member.id } })
    expect(prefs).toHaveLength(1)
    expect(prefs[0].timeEnd).toBe("11:00")
  })
})

describe("createSmallGroup / updateSmallGroup — scheduleTimeEnd", () => {
  it("persists scheduleTimeEnd when creating a small group", async () => {
    const lifeStage = await seedLifeStage()
    const leader = await seedMember()

    const result = await createSmallGroup({
      name: "Group A", leaderId: leader.id, parentGroupId: "",
      lifeStageId: lifeStage.id, genderFocus: "Mixed", language: [],
      ageRangeMin: "", ageRangeMax: "", meetingFormat: "InPerson",
      locationCity: "", memberLimit: "",
      scheduleDayOfWeek: "1", scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30",
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const group = await db.smallGroup.findUnique({ where: { id: result.data.id } })
    expect(group?.scheduleTimeStart).toBe("09:00")
    expect(group?.scheduleTimeEnd).toBe("10:30")
  })

  it("persists scheduleTimeEnd when updating a small group", async () => {
    const lifeStage = await seedLifeStage()
    const leader = await seedMember()
    const group = await seedSmallGroup(leader.id, { scheduleTimeStart: "09:00", scheduleTimeEnd: "10:00" })

    const result = await updateSmallGroup(group.id, {
      name: "Group A", leaderId: leader.id, parentGroupId: "",
      lifeStageId: lifeStage.id, genderFocus: "Mixed", language: [],
      ageRangeMin: "", ageRangeMax: "", meetingFormat: "InPerson",
      locationCity: "", memberLimit: "",
      scheduleDayOfWeek: "1", scheduleTimeStart: "09:00", scheduleTimeEnd: "11:00",
    })

    expect(result.success).toBe(true)
    const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
    expect(updated?.scheduleTimeEnd).toBe("11:00")
  })
})

describe("importSmallGroups — schedule time parsing", () => {
  function importRow(mapped: Record<string, string>) {
    return [{ mapped, resolution: "use-csv" as const }]
  }

  it("parses 12-hour am/pm meeting times and stores canonical 24-hour HH:MM", async () => {
    const result = await importSmallGroups(
      importRow({ name: "PM Group", scheduleDayOfWeek: "Wednesday", scheduleTime: "7:00 PM" }),
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(1)

    const group = await db.smallGroup.findFirst({ where: { name: "PM Group" } })
    expect(group?.scheduleDayOfWeek).toBe(3)
    expect(group?.scheduleTimeStart).toBe("19:00")
    // End time defaults to start + 2 hours when not provided
    expect(group?.scheduleTimeEnd).toBe("21:00")
  })

  it("parses an explicit am/pm end time", async () => {
    const result = await importSmallGroups(
      importRow({ name: "AM Group", scheduleTime: "9:30 AM", scheduleTimeEnd: "11:00 AM" }),
    )

    expect(result.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "AM Group" } })
    expect(group?.scheduleTimeStart).toBe("09:30")
    expect(group?.scheduleTimeEnd).toBe("11:00")
  })

  it("still accepts 24-hour times", async () => {
    const result = await importSmallGroups(
      importRow({ name: "24h Group", scheduleTime: "19:00", scheduleTimeEnd: "21:00" }),
    )

    expect(result.success).toBe(true)
    const group = await db.smallGroup.findFirst({ where: { name: "24h Group" } })
    expect(group?.scheduleTimeStart).toBe("19:00")
    expect(group?.scheduleTimeEnd).toBe("21:00")
  })
})

describe("createBreakoutGroup / updateBreakoutGroup — BreakoutGroupSchedule.timeEnd", () => {
  it("persists timeEnd when creating a breakout group", async () => {
    const { event, committee, role } = await seedEventWithCommitteeAndRole()
    const { vol } = await seedConfirmedVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1", facilitatorId: vol.id,
      language: ["Filipino"], genderFocus: "Mixed", meetingFormat: "InPerson",
      schedule: { dayOfWeek: 1, timeStart: "09:00", timeEnd: "10:30" },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const schedule = await db.breakoutGroupSchedule.findFirst({
      where: { breakoutGroupId: result.data.id },
    })
    expect(schedule?.timeStart).toBe("09:00")
    expect(schedule?.timeEnd).toBe("10:30")
  })

  it("persists timeEnd when updating a breakout group", async () => {
    const { event, committee, role } = await seedEventWithCommitteeAndRole()
    const { vol } = await seedConfirmedVolunteer(event.id, committee.id, role.id)

    const created = await createBreakoutGroup(event.id, {
      name: "Table 1", facilitatorId: vol.id,
      language: ["Filipino"], genderFocus: "Mixed", meetingFormat: "InPerson",
      schedule: { dayOfWeek: 1, timeStart: "09:00", timeEnd: "10:00" },
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = await updateBreakoutGroup(created.data.id, event.id, {
      name: "Table 1", facilitatorId: vol.id,
      language: ["Filipino"], genderFocus: "Mixed", meetingFormat: "InPerson",
      schedule: { dayOfWeek: 1, timeStart: "09:00", timeEnd: "10:45" },
    })

    expect(updated.success).toBe(true)
    const schedule = await db.breakoutGroupSchedule.findFirst({
      where: { breakoutGroupId: created.data.id },
    })
    expect(schedule?.timeEnd).toBe("10:45")
  })
})

describe("promoteGuestToMember — scheduleTimeEnd carried to SchedulePreference", () => {
  it("creates SchedulePreference with timeEnd from the guest record", async () => {
    const leader = await seedMember()
    const group = await seedSmallGroup(leader.id)
    const guest = await seedGuest({ scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30" })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)

    const pref = await db.schedulePreference.findFirst({
      where: { member: { guest: { id: guest.id } } },
    })
    expect(pref?.timeStart).toBe("09:00")
    expect(pref?.timeEnd).toBe("10:30")
  })

  it("creates SchedulePreference with null timeEnd when guest has none", async () => {
    const leader = await seedMember()
    const group = await seedSmallGroup(leader.id)
    const guest = await seedGuest({ scheduleTimeStart: "09:00", scheduleTimeEnd: null })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)

    const pref = await db.schedulePreference.findFirst({
      where: { member: { guest: { id: guest.id } } },
    })
    expect(pref?.timeStart).toBe("09:00")
    expect(pref?.timeEnd).toBeNull()
  })
})

// ─── Part 2: Matching engine uses stored timeEnd ───────────────────────────────
//
// The core test scenario: a group meets Mon 10:15–11:15.
//   - A candidate with stored timeEnd "10:30" overlaps (10:15–10:30) → score > 0 → included
//   - A candidate with timeEnd null falls back to addOneHour("09:00") = "10:00",
//     which does NOT overlap 10:15–11:15 → score = 0 → filtered out

describe("matchSmallGroups — guest stored scheduleTimeEnd", () => {
  it("includes a group that addOneHour would miss when stored timeEnd extends past group start", async () => {
    const leader = await seedMember()
    // Group: Mon 10:15–11:15
    const group = await seedSmallGroup(leader.id, { scheduleTimeStart: "10:15", scheduleTimeEnd: "11:15" })
    // Guest: Mon 09:00–10:30 (stored). Overlaps 10:15–10:30.
    // addOneHour("09:00") = "10:00" → no overlap → would be filtered out
    const guest = await seedGuest({ scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30" })

    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results.map((r) => r.groupId)).toContain(group.id)
  })

  it("excludes a group when null timeEnd falls back to addOneHour and there is no overlap", async () => {
    const leader = await seedMember()
    // Group: Mon 10:15–11:15
    const group = await seedSmallGroup(leader.id, { scheduleTimeStart: "10:15", scheduleTimeEnd: "11:15" })
    // Guest: Mon 09:00, no stored timeEnd → fallback "10:00" → no overlap with 10:15–11:15
    const guest = await seedGuest({ scheduleTimeStart: "09:00", scheduleTimeEnd: null })

    const results = await matchSmallGroups({ guestId: guest.id })
    expect(results.map((r) => r.groupId)).not.toContain(group.id)
  })
})

describe("matchSmallGroups — group stored scheduleTimeEnd", () => {
  it("guest can match a group whose stored timeEnd extends past the guest slot start", async () => {
    const leader = await seedMember()
    const leader2 = await seedMember({ firstName: "Leader2" })
    // Guest: Mon 10:15–11:15
    const guest = await seedGuest({ scheduleTimeStart: "10:15", scheduleTimeEnd: "11:15" })
    // Group A: stored timeEnd "10:30" → overlaps guest 10:15–10:30 → included
    const groupA = await seedSmallGroup(leader.id, { scheduleTimeStart: "09:00", scheduleTimeEnd: "10:30" })
    // Group B: null timeEnd → addOneHour("09:00") = "10:00" → no overlap → excluded
    const groupB = await seedSmallGroup(leader2.id, { scheduleTimeStart: "09:00", scheduleTimeEnd: null })

    const results = await matchSmallGroups({ guestId: guest.id })
    const ids = results.map((r) => r.groupId)
    expect(ids).toContain(groupA.id)
    expect(ids).not.toContain(groupB.id)
  })
})

describe("matchSmallGroups — member stored SchedulePreference.timeEnd", () => {
  it("includes a group that addOneHour would miss when stored timeEnd extends past group start", async () => {
    const leader = await seedMember()
    // Group: Mon 10:15–11:15
    const group = await seedSmallGroup(leader.id, { scheduleTimeStart: "10:15", scheduleTimeEnd: "11:15" })

    const member = await db.member.create({
      data: {
        firstName: "Test", lastName: "Member", dateJoined: new Date(), language: [],
        schedulePreferences: {
          create: { dayOfWeek: 1, timeStart: "09:00", timeEnd: "10:30" },
        },
      },
    })

    const results = await matchSmallGroups({ memberId: member.id })
    expect(results.map((r) => r.groupId)).toContain(group.id)
  })

  it("excludes a group when null timeEnd falls back to addOneHour and there is no overlap", async () => {
    const leader = await seedMember()
    // Group: Mon 10:15–11:15
    const group = await seedSmallGroup(leader.id, { scheduleTimeStart: "10:15", scheduleTimeEnd: "11:15" })

    const member = await db.member.create({
      data: {
        firstName: "Test", lastName: "Member", dateJoined: new Date(), language: [],
        schedulePreferences: {
          // null timeEnd → addOneHour("09:00") = "10:00" → no overlap
          create: { dayOfWeek: 1, timeStart: "09:00", timeEnd: null },
        },
      },
    })

    const results = await matchSmallGroups({ memberId: member.id })
    expect(results.map((r) => r.groupId)).not.toContain(group.id)
  })
})
