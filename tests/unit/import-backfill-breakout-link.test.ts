import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"
import { formatPhilippinePhone } from "@/lib/utils"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroup",
    "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry",
    "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

/**
 * Seeds an event with a breakout group whose facilitator (a Member, via a
 * Volunteer) does NOT yet lead a small group. Returns the breakout group id and
 * the facilitator member so the test can import that member's small group.
 */
async function seedBreakoutWithLeaderlessFacilitator(leader: {
  firstName: string
  lastName: string
  phone: string
}) {
  const event = await db.event.create({
    data: { name: "Conference", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Breakouts", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const member = await db.member.create({
    // Members are always persisted with a canonical "+63 XXX XXX XXXX" phone, so
    // seed that way — the import normalizes the CSV leaderMobile before lookup.
    data: { firstName: leader.firstName, lastName: leader.lastName, phone: formatPhilippinePhone(leader.phone), dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
  })
  const breakoutGroup = await db.breakoutGroup.create({
    data: { name: "Group A", eventId: event.id, facilitatorId: volunteer.id },
  })
  return { event, member, volunteer, breakoutGroup }
}

describe("breakout link back-fill on small group import", () => {
  it("links a facilitator's breakout group when their small group is imported", async () => {
    const { breakoutGroup, member } = await seedBreakoutWithLeaderlessFacilitator({
      firstName: "Grace",
      lastName: "Lee",
      phone: "09170000001",
    })

    // Sanity: no link before import.
    const before = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(before?.linkedSmallGroupId).toBeNull()

    const result = await importSmallGroups([
      {
        mapped: { name: "Grace's Group", leaderMobile: "09170000001" },
        resolution: "create",
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(1)

    const createdGroup = await db.smallGroup.findFirst({ where: { leaderId: member.id }, select: { id: true } })
    expect(createdGroup).not.toBeNull()

    const after = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(after?.linkedSmallGroupId).toBe(createdGroup!.id)
  })

  it("does not overwrite an existing link, and skips when the leader leads multiple groups", async () => {
    const { breakoutGroup, member } = await seedBreakoutWithLeaderlessFacilitator({
      firstName: "Mark",
      lastName: "Tan",
      phone: "09170000002",
    })

    // Pre-existing link to some other group — must be preserved.
    const otherGroup = await db.smallGroup.create({ data: { name: "Existing Link" } })
    await db.breakoutGroup.update({
      where: { id: breakoutGroup.id },
      data: { linkedSmallGroupId: otherGroup.id },
    })

    // Member already leads one group; the import creates a second → ambiguous.
    await db.smallGroup.create({ data: { name: "Mark's First Group", leaderId: member.id } })

    const result = await importSmallGroups([
      {
        mapped: { name: "Mark's Second Group", leaderMobile: "09170000002" },
        resolution: "create",
      },
    ])

    expect(result.success).toBe(true)

    const after = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(after?.linkedSmallGroupId).toBe(otherGroup.id)
  })
})
