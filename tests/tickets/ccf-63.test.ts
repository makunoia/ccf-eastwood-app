import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"

/**
 * Ticket verification suite for CCF-63.
 *
 * The Small Group leader confirmation form now matches the Catch Mech form:
 * decisions have three states — confirmed / pending / rejected — and a
 * rejection reason (notes) can be recorded alongside a declined request.
 *
 * Run locally:  pnpm verify:ticket CCF-63
 */
describe("CCF-63", () => {
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE "SmallGroupLog", "SmallGroupMemberRequest", "EventRegistrant", "Guest", "Member", "SmallGroup" RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function seedGroupAndRequest(token: string) {
    const leader = await db.member.create({
      data: { firstName: "Leader", lastName: "Test", language: [], dateJoined: new Date() },
    })
    const group = await db.smallGroup.create({
      data: { name: "Test Group", leaderId: leader.id, language: [], leaderConfirmationToken: token },
    })
    const guest = await db.guest.create({
      data: { firstName: "Jane", lastName: "Doe", language: [] },
    })
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, guestId: guest.id, status: "Pending" },
    })
    return { group, guest, request }
  }

  describe("unit", () => {
    it("pending decision leaves SmallGroupMemberRequest status unchanged", async () => {
      const { request } = await seedGroupAndRequest("tkn-ccf63-pending")
      const result = await submitMemberConfirmations("tkn-ccf63-pending", [
        { requestId: request.id, status: "pending" },
      ])
      expect(result.success).toBe(true)
      const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
      expect(updated?.status).toBe("Pending")
      expect(updated?.resolvedAt).toBeNull()
    })

    it("rejected decision stores notes on SmallGroupMemberRequest", async () => {
      const { request } = await seedGroupAndRequest("tkn-ccf63-rejected")
      const result = await submitMemberConfirmations("tkn-ccf63-rejected", [
        { requestId: request.id, status: "rejected", notes: "Not regularly attending" },
      ])
      expect(result.success).toBe(true)
      const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
      expect(updated?.status).toBe("Rejected")
      expect(updated?.notes).toBe("Not regularly attending")
      expect(updated?.resolvedAt).not.toBeNull()
    })

    it("confirmed decision promotes guest to member", async () => {
      const { guest, request } = await seedGroupAndRequest("tkn-ccf63-confirmed")
      const result = await submitMemberConfirmations("tkn-ccf63-confirmed", [
        { requestId: request.id, status: "confirmed" },
      ])
      expect(result.success).toBe(true)
      const updatedRequest = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
      expect(updatedRequest?.status).toBe("Confirmed")
      const updatedGuest = await db.guest.findUnique({ where: { id: guest.id } })
      expect(updatedGuest?.memberId).not.toBeNull()
    })
  })

  describe("integration", () => {
    it("mixed decisions in one submission handle each state independently", async () => {
      const leader = await db.member.create({
        data: { firstName: "Leader2", lastName: "Test", language: [], dateJoined: new Date() },
      })
      const group = await db.smallGroup.create({
        data: { name: "Mixed Group", leaderId: leader.id, language: [], leaderConfirmationToken: "tkn-ccf63-mixed" },
      })
      const [gConfirm, gPending, gReject] = await Promise.all([
        db.guest.create({ data: { firstName: "Confirmed", lastName: "One", language: [] } }),
        db.guest.create({ data: { firstName: "Pending", lastName: "Two", language: [] } }),
        db.guest.create({ data: { firstName: "Rejected", lastName: "Three", language: [] } }),
      ])
      const [rConfirm, rPending, rReject] = await Promise.all([
        db.smallGroupMemberRequest.create({ data: { smallGroupId: group.id, guestId: gConfirm.id, status: "Pending" } }),
        db.smallGroupMemberRequest.create({ data: { smallGroupId: group.id, guestId: gPending.id, status: "Pending" } }),
        db.smallGroupMemberRequest.create({ data: { smallGroupId: group.id, guestId: gReject.id, status: "Pending" } }),
      ])

      const result = await submitMemberConfirmations("tkn-ccf63-mixed", [
        { requestId: rConfirm.id, status: "confirmed" },
        { requestId: rPending.id, status: "pending" },
        { requestId: rReject.id, status: "rejected", notes: "Does not meet criteria" },
      ])
      expect(result.success).toBe(true)

      const [uConfirm, uPending, uReject] = await Promise.all([
        db.smallGroupMemberRequest.findUnique({ where: { id: rConfirm.id } }),
        db.smallGroupMemberRequest.findUnique({ where: { id: rPending.id } }),
        db.smallGroupMemberRequest.findUnique({ where: { id: rReject.id } }),
      ])
      expect(uConfirm?.status).toBe("Confirmed")
      expect(uPending?.status).toBe("Pending")
      expect(uReject?.status).toBe("Rejected")
      expect(uReject?.notes).toBe("Does not meet criteria")
    })
  })

  describe("regression", () => {
    it("rejected decision without notes still resolves (notes is optional)", async () => {
      const { request } = await seedGroupAndRequest("tkn-ccf63-nonnotes")
      const result = await submitMemberConfirmations("tkn-ccf63-nonnotes", [
        { requestId: request.id, status: "rejected" },
      ])
      expect(result.success).toBe(true)
      const updated = await db.smallGroupMemberRequest.findUnique({ where: { id: request.id } })
      expect(updated?.status).toBe("Rejected")
    })

    it("pending decision does not create a SmallGroupLog entry", async () => {
      const { request } = await seedGroupAndRequest("tkn-ccf63-nolog")
      await submitMemberConfirmations("tkn-ccf63-nolog", [
        { requestId: request.id, status: "pending" },
      ])
      const logCount = await db.smallGroupLog.count()
      expect(logCount).toBe(0)
    })
  })
})
