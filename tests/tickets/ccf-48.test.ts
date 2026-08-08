import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { db } from "@/lib/db"
import {
  tryCreateSmallGroupRequestFromBreakout,
  tryCancelSmallGroupRequestFromBreakout,
} from "@/lib/create-small-group-request"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"

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

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedEventAndBreakout(eventName = "B1G Fridays 2026") {
  const event = await db.event.create({
    data: { name: eventName, type: "OneTime", startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01") },
    select: { id: true, name: true },
  })

  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
    select: { id: true },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
    select: { id: true },
  })

  const leaderMember = await db.member.create({
    data: { firstName: "Leader", lastName: "Faci", dateJoined: new Date(), language: [] },
    select: { id: true },
  })

  const smallGroup = await db.smallGroup.create({
    data: { name: "Leader Group", leaderId: leaderMember.id },
    select: { id: true },
  })

  const volunteer = await db.volunteer.create({
    data: { memberId: leaderMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id },
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

async function seedGuestRegistrant(eventId: string) {
  const guest = await db.guest.create({
    data: { firstName: "Jane", lastName: "Doe", language: [] },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, guestId: guest.id },
    select: { id: true },
  })
  return { guest, registrant }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CCF-48 — Activity logs include event name context", () => {
  describe("integration — tryCreateSmallGroupRequestFromBreakout", () => {
    it("includes event name in TempAssignmentCreated log description for a guest", async () => {
      const { event, smallGroup, breakoutGroup } = await seedEventAndBreakout("B1G Fridays 2026")
      const { registrant } = await seedGuestRegistrant(event.id)

      await tryCreateSmallGroupRequestFromBreakout(breakoutGroup.id, registrant.id)

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentCreated" },
        select: { description: true },
      })

      expect(log?.description).toContain("B1G Fridays 2026")
    })
  })

  describe("integration — tryCancelSmallGroupRequestFromBreakout", () => {
    it("includes event name in TempAssignmentRejected log description when cancelling", async () => {
      const { event, smallGroup, breakoutGroup } = await seedEventAndBreakout("B1G Fridays 2026")
      const { guest, registrant } = await seedGuestRegistrant(event.id)

      // Pre-create a pending request so cancellation can find it
      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, guestId: guest.id, status: "Pending", breakoutGroupId: breakoutGroup.id },
      })

      await tryCancelSmallGroupRequestFromBreakout(breakoutGroup.id, registrant.id)

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentRejected" },
        select: { description: true },
      })

      expect(log?.description).toContain("B1G Fridays 2026")
    })
  })

  describe("integration — submitCatchMechConfirmations", () => {
    it("declined log includes event name", async () => {
      const { event, smallGroup, session, breakoutGroup } = await seedEventAndBreakout("B1G Fridays 2026")
      const member = await db.member.create({
        data: { firstName: "John", lastName: "Smith", dateJoined: new Date(), language: [] },
        select: { id: true },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
        select: { id: true },
      })

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, memberId: member.id, status: "Pending", breakoutGroupId: breakoutGroup.id },
      })

      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "NotInterested" },
      ])

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentRejected" },
        select: { description: true },
      })

      expect(log?.description).toContain("B1G Fridays 2026")
      expect(log?.description).toMatch(/declined via Catch Mech of B1G Fridays 2026/)
    })

    it("confirmed log includes event name", async () => {
      const { event, smallGroup, session } = await seedEventAndBreakout("B1G Fridays 2026")
      const { registrant } = await seedGuestRegistrant(event.id)

      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "confirmed" },
      ])

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "MemberAdded" },
        select: { description: true },
      })

      expect(log?.description).toContain("B1G Fridays 2026")
      expect(log?.description).toMatch(/confirmed via Catch Mech of B1G Fridays 2026/)
    })
  })

  describe("integration — submitMemberConfirmations (leader confirmation token)", () => {
    it("rejected log includes 'via Catch Mech Link of EventName' when request originated from catch mech", async () => {
      const { smallGroup, breakoutGroup } = await seedEventAndBreakout("B1G Fridays 2026")

      const token = "test-leader-token-ccf48"
      await db.smallGroup.update({
        where: { id: smallGroup.id },
        data: { leaderConfirmationToken: token },
      })

      const guest = await db.guest.create({
        data: { firstName: "Alex", lastName: "Cruz", language: [] },
        select: { id: true },
      })
      const request = await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, guestId: guest.id, status: "Pending", breakoutGroupId: breakoutGroup.id },
        select: { id: true },
      })

      await submitMemberConfirmations(token, [{ requestId: request.id, status: "rejected" }])

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentRejected" },
        select: { description: true },
      })

      expect(log?.description).toContain("via Catch Mech Link of B1G Fridays 2026")
    })

    it("rejected log does NOT include catch mech context when request has no breakout group (direct admin assignment)", async () => {
      const { smallGroup } = await seedEventAndBreakout("B1G Fridays 2026")

      const token = "test-leader-token-ccf48-direct"
      await db.smallGroup.update({
        where: { id: smallGroup.id },
        data: { leaderConfirmationToken: token },
      })

      const guest = await db.guest.create({
        data: { firstName: "Ben", lastName: "Lee", language: [] },
        select: { id: true },
      })
      // No breakoutGroupId — direct admin assignment
      const request = await db.smallGroupMemberRequest.create({
        data: { smallGroupId: smallGroup.id, guestId: guest.id, status: "Pending" },
        select: { id: true },
      })

      await submitMemberConfirmations(token, [{ requestId: request.id, status: "rejected" }])

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentRejected" },
        select: { description: true },
      })

      expect(log?.description).toContain("declined by the group leader")
      expect(log?.description).not.toContain("Catch Mech Link")
    })
  })

  describe("regression — event name appears in all catch mech log descriptions", () => {
    it("breakout placement description contains event name, not generic 'breakout group placement'", async () => {
      const { event, smallGroup, breakoutGroup } = await seedEventAndBreakout("Summer Camp 2026")
      const { registrant } = await seedGuestRegistrant(event.id)

      await tryCreateSmallGroupRequestFromBreakout(breakoutGroup.id, registrant.id)

      const log = await db.smallGroupLog.findFirst({
        where: { smallGroupId: smallGroup.id, action: "TempAssignmentCreated" },
        select: { description: true },
      })

      expect(log?.description).toContain("Summer Camp 2026")
      // Old generic wording without event name should be gone
      expect(log?.description).not.toMatch(/via breakout group placement \(pending/)
    })
  })
})
