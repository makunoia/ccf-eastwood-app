import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { computeGuestStatus } from "@/lib/guest-utils"
import { db } from "@/lib/db"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"

/**
 * Ticket verification suite for CCF-38.
 * Fix: guest Rejected status not reflected; log rejection in Guest activity log
 *
 * Two bugs fixed:
 *  1. submitMemberConfirmations (leader rejection) now updates SmallGroupMemberRequest.status
 *     to "Rejected" and writes a SmallGroupLog entry with action "TempAssignmentRejected".
 *  2. computeGuestStatus now correctly derives "Declined" from hasRejectedSmallGroupRequest.
 *
 * Run locally:  pnpm verify:ticket CCF-38
 */
describe("CCF-38", () => {
  describe("unit", () => {
    it("computeGuestStatus returns 'Declined' when hasRejectedSmallGroupRequest is true", () => {
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [],
      })
      expect(status).toBe("Declined")
    })

    it("computeGuestStatus returns 'Declined' when guest has a breakout membership and was rejected", () => {
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
      expect(status).toBe("Declined")
    })

    it("computeGuestStatus returns 'Matched' (not 'Declined') when guest has a breakout membership but no rejection", () => {
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
      expect(status).toBe("Matched")
    })

    it("'Pending' takes precedence over rejection — an active pending request overrides a prior rejection", () => {
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: true,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [],
      })
      expect(status).toBe("Pending")
    })

    it("'Member' takes precedence over rejection when memberId is set", () => {
      const status = computeGuestStatus({
        memberId: "member-1",
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [],
      })
      expect(status).toBe("Member")
    })
  })

  describe("integration", () => {
    beforeEach(async () => {
      // Clean up tables affected by this ticket before each integration test.
      // CASCADE handles the circular FK between Member ↔ SmallGroup.
      await db.$executeRaw`TRUNCATE "SmallGroupLog", "SmallGroupMemberRequest", "Guest", "SmallGroup", "Member" RESTART IDENTITY CASCADE`
    })

    afterAll(async () => {
      await db.$disconnect()
    })

    it("submitMemberConfirmations with confirmed=false sets SmallGroupMemberRequest.status to 'Rejected' and populates resolvedAt", async () => {
      const leader = await db.member.create({
        data: { firstName: "Test", lastName: "Leader", language: [], dateJoined: new Date() },
      })
      const group = await db.smallGroup.create({
        data: { name: "Test Group", leaderId: leader.id, language: [], leaderConfirmationToken: "test-token-ccf38-status" },
      })
      const guest = await db.guest.create({
        data: { firstName: "Jane", lastName: "Doe", language: [] },
      })
      const request = await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: guest.id, status: "Pending" },
      })

      const result = await submitMemberConfirmations("test-token-ccf38-status", [{ requestId: request.id, status: "rejected" }])
      expect(result.success).toBe(true)

      const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
      expect(updated?.status).toBe("Rejected")
      expect(updated?.resolvedAt).not.toBeNull()
    })

    it("submitMemberConfirmations with confirmed=false writes a SmallGroupLog row with action 'TempAssignmentRejected'", async () => {
      const leader = await db.member.create({
        data: { firstName: "Test", lastName: "Leader", language: [], dateJoined: new Date() },
      })
      const group = await db.smallGroup.create({
        data: { name: "Test Group", leaderId: leader.id, language: [], leaderConfirmationToken: "test-token-ccf38-log" },
      })
      const guest = await db.guest.create({
        data: { firstName: "Jane", lastName: "Doe", language: [] },
      })
      const request = await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: guest.id, status: "Pending" },
      })

      await submitMemberConfirmations("test-token-ccf38-log", [{ requestId: request.id, status: "rejected" }])

      const log = await db.smallGroupLog.findFirst({ where: { guestId: guest.id } })
      expect(log).not.toBeNull()
      expect(log?.action).toBe("TempAssignmentRejected")
      expect(log?.description).toContain("declined by the group leader")
    })
  })

  describe("regression", () => {
    it("a rejected guest who also attended an event is still 'Declined', not 'EventAttendee'", () => {
      // If the hasRejectedSmallGroupRequest check is removed or moved below the EventAttendee
      // loop, this guest would incorrectly surface as 'EventAttendee' in the pipeline.
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [
          {
            attendedAt: new Date("2025-01-01"),
            occurrenceAttendances: [],
            breakoutGroupMemberships: [],
          },
        ],
      })
      expect(status).toBe("Declined")
      expect(status).not.toBe("EventAttendee")
    })

    it("a guest with no rejection and no attendance is 'New', not mistakenly 'Declined'", () => {
      // Guard against the rejection flag being over-applied to guests with no rejected requests.
      const status = computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [],
      })
      expect(status).toBe("New")
    })
  })
})
