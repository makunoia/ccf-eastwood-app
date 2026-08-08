import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"

afterAll(async () => {
  await db.$disconnect()
})

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
    "SmallGroupMemberRequest", "SmallGroupLog", "EventRegistrant",
    "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "EventModule", "Event",
    "SmallGroup",
    "Guest", "SchedulePreference", "Member"
    RESTART IDENTITY CASCADE`
})

// ─── Shared seed helpers ──────────────────────────────────────────────────────

async function seedBaseFixture() {
  const event = await db.event.create({
    data: { name: "Test Event", type: "OneTime", startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01") },
    select: { id: true },
  })

  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
    select: { id: true },
  })

  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
    select: { id: true },
  })

  // Leader member with an existing SmallGroup (non-Timothy)
  const leaderMember = await db.member.create({
    data: { firstName: "Leader", lastName: "Faci", dateJoined: new Date(), language: [] },
    select: { id: true },
  })

  const smallGroup = await db.smallGroup.create({
    data: { name: "Leader Group", leaderId: leaderMember.id },
    select: { id: true },
  })

  const volunteer = await db.volunteer.create({
    data: {
      memberId: leaderMember.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
    select: { id: true },
  })

  const breakoutGroup = await db.breakoutGroup.create({
    data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id, linkedSmallGroupId: smallGroup.id },
    select: { id: true },
  })

  const session = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakoutGroup.id, facilitatorVolunteerId: volunteer.id },
    select: { token: true },
  })

  return { event, leaderMember, smallGroup, breakoutGroup, session, committee, role, volunteer }
}

async function seedMemberRegistrant(eventId: string) {
  const member = await db.member.create({
    data: { firstName: "Jane", lastName: "Doe", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, memberId: member.id },
    select: { id: true },
  })
  return { member, registrant }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * CCF-27 — Catch Mech confirmation form improvements:
 *  1. Submit button no longer disabled when all are declined
 *  2. Rejection reason is saved to SmallGroupMemberRequest.notes
 *  3. Pending status leaves SmallGroupMemberRequest untouched
 */
describe("CCF-27 – Catch Mech confirmation form improvements", () => {
  describe("regression – submit with all declined", () => {
    it("submitting all-declined returns success (button should not be blocked)", async () => {
      const { session, smallGroup, event } = await seedBaseFixture()
      const { registrant } = await seedMemberRegistrant(event.id)

      // Pre-create a pending request
      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, memberId: (await db.eventRegistrant.findUnique({ where: { id: registrant.id }, select: { memberId: true } }))!.memberId!, status: "Pending" },
      })

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "Others", reason: "Not ready yet" },
      ])

      expect(result.success).toBe(true)
    })
  })

  describe("integration – rejection reason saved", () => {
    it("saves the rejection reason to SmallGroupMemberRequest.notes", async () => {
      const { session, smallGroup, event } = await seedBaseFixture()
      const { registrant } = await seedMemberRegistrant(event.id)
      const memberId = (await db.eventRegistrant.findUnique({ where: { id: registrant.id }, select: { memberId: true } }))!.memberId!

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, memberId, status: "Pending" },
      })

      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "Others", reason: "Prefers another group" },
      ])

      const req = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: smallGroup.id, memberId },
        select: { status: true, notes: true },
      })

      expect(req?.status).toBe("Rejected")
      expect(req?.notes).toBe("Prefers another group")
    })

    it("creates a new rejected request with reason when no pre-existing request exists", async () => {
      const { session, smallGroup, event } = await seedBaseFixture()
      const { registrant } = await seedMemberRegistrant(event.id)
      const memberId = (await db.eventRegistrant.findUnique({ where: { id: registrant.id }, select: { memberId: true } }))!.memberId!

      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "Others", reason: "No-show" },
      ])

      const req = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: smallGroup.id, memberId },
        select: { status: true, notes: true },
      })

      expect(req?.status).toBe("Rejected")
      expect(req?.notes).toBe("No-show")
    })
  })

  describe("integration – pending status leaves request untouched", () => {
    it("does not create or update SmallGroupMemberRequest for pending decisions", async () => {
      const { session, smallGroup, event } = await seedBaseFixture()
      const { registrant } = await seedMemberRegistrant(event.id)
      const memberId = (await db.eventRegistrant.findUnique({ where: { id: registrant.id }, select: { memberId: true } }))!.memberId!

      const existing = await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, memberId, status: "Pending" },
        select: { id: true },
      })

      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "pending" },
      ])

      const req = await db.smallGroupMemberRequest.findUnique({
        where: { id: existing.id },
        select: { status: true },
      })

      // Must remain Pending — not touched
      expect(req?.status).toBe("Pending")

      // No extra records created
      const count = await db.smallGroupMemberRequest.count({
        where: { smallGroupId: smallGroup.id, memberId },
      })
      expect(count).toBe(1)
    })
  })
})
