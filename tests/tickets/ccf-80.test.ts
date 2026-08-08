import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"

/**
 * CCF-80: Catch Mech form incorrectly triggers "Small Group set up UI"
 * for Timothy volunteers who only have pending (no confirmed) participants.
 *
 * Fix: `requiresGroupName` must only be true when the Timothy has at least
 * one "confirmed" decision — not when all decisions are pending or declined.
 */

async function seedTimothyFixture() {
  const event = await db.event.create({
    data: { name: "Test Event CCF-80", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })

  // Timothy: a Member with no led groups
  const timothy = await db.member.create({
    data: { firstName: "Tim", lastName: "Othy", dateJoined: new Date(), language: [] },
  })

  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })

  const volunteer = await db.volunteer.create({
    data: {
      memberId: timothy.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })

  const breakout = await db.breakoutGroup.create({
    data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
  })

  const session = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: volunteer.id },
  })

  // Two guest registrants
  const guest1 = await db.guest.create({ data: { firstName: "Alice", lastName: "Guest", language: [] } })
  const guest2 = await db.guest.create({ data: { firstName: "Bob", lastName: "Guest", language: [] } })

  const reg1 = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest1.id } })
  const reg2 = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest2.id } })

  return { session, reg1, reg2 }
}

describe("CCF-80", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
        "Volunteer", "CommitteeRole", "VolunteerCommittee",
        "EventRegistrant", "Guest", "SmallGroupMemberRequest",
        "SmallGroupLog", "SmallGroup", "Member",
        "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  describe("integration", () => {
    it("does NOT return requiresGroupName when a Timothy submits with all-pending decisions", async () => {
      const { session, reg1, reg2 } = await seedTimothyFixture()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: reg1.id, status: "pending" },
        { registrantId: reg2.id, status: "pending" },
      ])

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.requiresGroupName).toBe(false)
      }
    })

    it("returns requiresGroupName when a Timothy has at least one confirmed decision", async () => {
      const { session, reg1, reg2 } = await seedTimothyFixture()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: reg1.id, status: "confirmed" },
        { registrantId: reg2.id, status: "pending" },
      ])

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.requiresGroupName).toBe(true)
      }
    })

    it("does NOT return requiresGroupName when a Timothy submits with all-declined decisions", async () => {
      const { session, reg1, reg2 } = await seedTimothyFixture()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: reg1.id, status: "declined", declineReason: "Others", reason: "Not attending" },
        { registrantId: reg2.id, status: "declined", declineReason: "Others", reason: "Not attending" },
      ])

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.requiresGroupName).toBe(false)
      }
    })
  })

  describe("regression", () => {
    it("Timothy with only pending participants does not trigger Small Group setup UI", async () => {
      const { session, reg1 } = await seedTimothyFixture()

      // Bug: previously this would always return requiresGroupName: true for any Timothy
      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: reg1.id, status: "pending" },
      ])

      expect(result.success).toBe(true)
      if (result.success) {
        // Must NOT trigger the group-name UI when no one is confirmed
        expect(result.requiresGroupName).toBe(false)
      }
    })
  })
})
