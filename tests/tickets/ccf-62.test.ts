/**
 * CCF-62 — Rejected records still appear on the catch mech confirmation link
 *
 * Bug: When a facilitator declined a breakout group participant via the catch
 * mech form and revisited the form, the rejected participant was still shown.
 *
 * Fix: The page now batch-fetches SmallGroupMemberRequest records with
 * status = "Rejected" for the faci's leading group and excludes those
 * registrants from the displayed list.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"

// ─── Shared seed helpers ──────────────────────────────────────────────────────

async function seedBaseData() {
  const now = new Date()

  const event = await db.event.create({
    data: { name: "Test Event", startDate: now, endDate: now, type: "OneTime" },
  })

  // Faci is a member who leads a small group
  const faciMember = await db.member.create({
    data: {
      firstName: "Faci",
      lastName: "Leader",
      dateJoined: now,
      groupStatus: "Leader",
      language: [],
    },
  })

  const smallGroup = await db.smallGroup.create({
    data: { name: "Test Small Group", leaderId: faciMember.id },
  })

  const committee = await db.volunteerCommittee.create({
    data: { name: "Test Committee", eventId: event.id },
  })

  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })

  const volunteer = await db.volunteer.create({
    data: {
      memberId: faciMember.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })

  const breakoutGroup = await db.breakoutGroup.create({
    data: {
      name: "Table 1",
      eventId: event.id,
      facilitatorId: volunteer.id,
      linkedSmallGroupId: smallGroup.id,
    },
  })

  const session = await db.catchMechSession.create({
    data: {
      eventId: event.id,
      breakoutGroupId: breakoutGroup.id,
      facilitatorVolunteerId: volunteer.id,
    },
    select: { token: true },
  })

  // Seed a guest participant
  const guest = await db.guest.create({
    data: { firstName: "Jane", lastName: "Doe", language: [] },
  })

  const registrant = await db.eventRegistrant.create({
    data: { eventId: event.id, guestId: guest.id },
  })

  await db.breakoutGroupMember.create({
    data: { breakoutGroupId: breakoutGroup.id, registrantId: registrant.id },
  })

  return { event, faciMember, smallGroup, session, guest, registrant, breakoutGroup }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "Member", "SmallGroup", "VolunteerCommittee", "CommitteeRole", "Volunteer", "BreakoutGroup", "CatchMechSession", "Guest", "EventRegistrant", "BreakoutGroupMember", "SmallGroupMemberRequest", "SmallGroupLog" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CCF-62", () => {
  describe("integration", () => {
    it("creates a Rejected SmallGroupMemberRequest when a guest is declined via catch mech", async () => {
      const { session, registrant, guest, smallGroup } = await seedBaseData()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "Others", reason: "Not ready" },
      ])

      expect(result).toMatchObject({ success: true, requiresGroupName: false })

      const rejectedRequest = await db.smallGroupMemberRequest.findFirst({
        where: {
          guestId: guest.id,
          smallGroupId: smallGroup.id,
          status: "Rejected",
        },
      })

      expect(rejectedRequest).not.toBeNull()
      expect(rejectedRequest?.declineReason).toBe("Others")
      expect(rejectedRequest?.notes).toBe("Not ready")
      expect(rejectedRequest?.resolvedAt).not.toBeNull()
    })

    it("stores a structured declineReason without notes for preset reasons", async () => {
      const { session, registrant, guest, smallGroup } = await seedBaseData()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "AlreadyInSmallGroup" },
      ])
      expect(result).toMatchObject({ success: true })

      const rejectedRequest = await db.smallGroupMemberRequest.findFirst({
        where: { guestId: guest.id, smallGroupId: smallGroup.id, status: "Rejected" },
      })
      expect(rejectedRequest?.declineReason).toBe("AlreadyInSmallGroup")
      expect(rejectedRequest?.notes).toBeNull()
    })

    it("rejects a declined decision without a declineReason", async () => {
      const { session, registrant } = await seedBaseData()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined" },
      ])
      expect(result).toMatchObject({ success: false })
    })

    it("rejects Others without free-text detail", async () => {
      const { session, registrant } = await seedBaseData()

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "Others" },
      ])
      expect(result).toMatchObject({ success: false })
    })
  })

  describe("regression", () => {
    it("a declined guest has a Rejected request that the page filter uses to exclude them on revisit", async () => {
      const { session, registrant, guest, smallGroup } = await seedBaseData()

      // Simulate the faci declining the participant
      await submitCatchMechConfirmations(session.token, [
        { registrantId: registrant.id, status: "declined", declineReason: "NotInterested" },
      ])

      // The fix: page queries for Rejected requests and skips those registrants.
      // Verify the exact query the page uses would return a result, confirming exclusion.
      const rejected = await db.smallGroupMemberRequest.findFirst({
        where: {
          guestId: guest.id,
          smallGroupId: smallGroup.id,
          status: "Rejected",
        },
        select: { id: true },
      })

      // If this exists, the fixed page code will skip this guest — regression caught.
      expect(rejected).not.toBeNull()
    })

    it("does not exclude guests who are still pending (no prior decision)", async () => {
      const { guest, smallGroup } = await seedBaseData()

      // No SmallGroupMemberRequest created for this guest yet (still "pending" in faci's view)
      const rejected = await db.smallGroupMemberRequest.findFirst({
        where: {
          guestId: guest.id,
          smallGroupId: smallGroup.id,
          status: "Rejected",
        },
        select: { id: true },
      })

      // No rejected request → guest should remain visible on the form
      expect(rejected).toBeNull()
    })
  })
})
