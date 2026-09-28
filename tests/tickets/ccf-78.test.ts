import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: undefined, name: "Test Admin", email: "test@example.com", username: "test-admin",
      role: "SuperAdmin", permissions: [], eventAccess: [], totpEnabled: false,
      mustChangePassword: false, requiresTotpSetup: false,
    },
  }),
}))

import { db } from "@/lib/db"
import { createBreakoutGroup, updateBreakoutGroup } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => { await db.$disconnect() })

async function seed() {
  const event = await db.event.create({ data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date() } })
  const committee = await db.volunteerCommittee.create({ data: { name: "Facilitators", eventId: event.id } })
  const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })
  const member = await db.member.create({ data: { firstName: "New", lastName: "Facilitator", dateJoined: new Date(), language: [] } })
  const volunteer = await db.volunteer.create({ data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
  return { event, volunteer }
}

describe("breakout group criteria are independent of DGroup leadership", () => {
  it("creates a breakout group with a facilitator who leads no DGroup and no criteria", async () => {
    const { event, volunteer } = await seed()
    const result = await createBreakoutGroup({ eventId: event.id }, {
      name: "Breakout Group A", facilitatorId: volunteer.id, lifeStageIds: [], language: [],
    })
    expect(result.success).toBe(true)
  })

  it("updates a breakout group with the same facilitator and a partial age range", async () => {
    const { event, volunteer } = await seed()
    const group = await db.breakoutGroup.create({ data: { eventId: event.id, name: "Breakout Group A" } })
    const result = await updateBreakoutGroup(group.id, { eventId: event.id }, {
      name: group.name, facilitatorId: volunteer.id, lifeStageIds: [], language: [], ageRangeMin: 25,
    })
    expect(result.success).toBe(true)
    const updated = await db.breakoutGroup.findUnique({ where: { id: group.id } })
    expect(updated?.ageRangeMin).toBe(25)
    expect(updated?.ageRangeMax).toBeNull()
  })
})
