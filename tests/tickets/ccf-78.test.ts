import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { db } from "@/lib/db"
import { createBreakoutGroup, updateBreakoutGroup } from "@/app/(dashboard)/events/breakout-actions"

/**
 * CCF-78 — Timothy Information should be required if volunteer is a Timothy
 * when creating a Breakout Group.
 *
 * A Timothy is a volunteer whose member has no led small groups (ledGroups.length === 0).
 * When such a volunteer is assigned as facilitator, the matching profile fields
 * (Life Stage, Gender Focus, Language, Meeting Format, Meeting Schedule) become
 * required so the system has enough data to set up their future small group.
 */

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedBase() {
  const event = await db.event.create({
    data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Faci Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  return { event, committee, role }
}

async function seedTimothyVolunteer(eventId: string, committeeId: string, roleId: string) {
  const member = await db.member.create({
    data: { firstName: "Tim", lastName: "Othy", dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId, preferredRoleId: roleId, status: "Confirmed" },
  })
  // Timothy: member has no led small groups
  return { member, volunteer }
}

async function seedLeaderVolunteer(eventId: string, committeeId: string, roleId: string) {
  const member = await db.member.create({
    data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
  })
  const smallGroup = await db.smallGroup.create({
    data: { name: "Leader's Group", leaderId: member.id },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId, preferredRoleId: roleId, status: "Confirmed" },
  })
  return { member, volunteer, smallGroup }
}

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── createBreakoutGroup ───────────────────────────────────────────────────────

describe("CCF-78 — createBreakoutGroup with Timothy facilitator", () => {
  it("succeeds when Timothy facilitator has all required profile fields", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      language: ["Filipino"],
      genderFocus: "Mixed",
      meetingFormat: "InPerson",
      schedule: { dayOfWeek: 0, timeStart: "09:00" },
    })

    expect(result.success).toBe(true)
  })

  it("rejects when Timothy facilitator has no profile fields at all", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      language: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Timothy profile requires/i)
  })

  it("rejects when language is missing for Timothy facilitator", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      genderFocus: "Mixed",
      language: [],
      meetingFormat: "InPerson",
      schedule: { dayOfWeek: 0, timeStart: "09:00" },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Language")
  })

  it("rejects when schedule is missing for Timothy facilitator", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      meetingFormat: "InPerson",
      schedule: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Meeting Schedule")
  })

  it("allows no profile when facilitator is a non-Timothy (has led groups)", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedLeaderVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 2",
      facilitatorId: volunteer.id,
      language: [],
    })

    expect(result.success).toBe(true)
  })

  it("allows no profile when no facilitator is assigned", async () => {
    const { event } = await seedBase()

    const result = await createBreakoutGroup(event.id, {
      name: "Table 3",
      language: [],
    })

    expect(result.success).toBe(true)
  })
})

// ─── updateBreakoutGroup ───────────────────────────────────────────────────────

describe("CCF-78 — updateBreakoutGroup with Timothy facilitator", () => {
  it("rejects update when Timothy facilitator is missing required profile", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)
    const group = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id },
    })

    const result = await updateBreakoutGroup(group.id, event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      language: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Timothy profile requires/i)
  })

  it("succeeds update when Timothy facilitator has all required profile fields", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)
    const group = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id },
    })

    const result = await updateBreakoutGroup(group.id, event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      genderFocus: "Mixed",
      language: ["Filipino"],
      meetingFormat: "InPerson",
      schedule: { dayOfWeek: 1, timeStart: "10:00" },
    })

    expect(result.success).toBe(true)
  })
})

// ─── Regression ───────────────────────────────────────────────────────────────

describe("CCF-78 — regression", () => {
  it("non-Timothy facilitator can still be assigned without any profile (existing behaviour)", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedLeaderVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Regression Table",
      facilitatorId: volunteer.id,
      language: [],
    })

    expect(result.success).toBe(true)
  })

  it("error message explicitly lists each missing Timothy profile field", async () => {
    const { event, committee, role } = await seedBase()
    const { volunteer } = await seedTimothyVolunteer(event.id, committee.id, role.id)

    const result = await createBreakoutGroup(event.id, {
      name: "Table 1",
      facilitatorId: volunteer.id,
      language: [],
      // All profile fields missing
    })

    expect(result.success).toBe(false)
    // All 4 required fields mentioned
    expect(result.error).toContain("Gender Focus")
    expect(result.error).toContain("Language")
    expect(result.error).toContain("Meeting Format")
    expect(result.error).toContain("Meeting Schedule")
  })
})
