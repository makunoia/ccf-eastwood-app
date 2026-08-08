import { describe, it, expect, beforeEach, afterAll } from "vitest"

import { db } from "@/lib/db"
import { tallyDecisions } from "@/lib/catch-mech/submission-log"
import {
  submitCatchMechConfirmations,
  createSmallGroupForTimothy,
} from "@/app/events/[id]/catch-mech/actions"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"

/**
 * Confirmation submission log.
 *
 * Records one ConfirmationSubmission every time a Catch Mech facilitator or a
 * small group leader answers their confirmation form.
 *
 * Pins the blind spots this closes — cases that previously left NO database
 * trace at all despite the submitter seeing a success screen:
 *  - a leader deferring every request ("pending" writes nothing)
 *  - a Timothy declining with no group yet (SmallGroupLog.smallGroupId is
 *    non-nullable, so that path could not be logged)
 *  - a leader submitting against a group with zero pending requests
 *  - repeat submissions, which the already-resolved guards skip silently
 *
 * Also pins that SmallGroupLog now carries the acting Member (public token
 * flows have no User), and that ccf-63's "pending writes no SmallGroupLog"
 * guarantee still holds — the new rows live in a separate table.
 *
 * Run locally:  npx vitest run tests/tickets/confirmation-submission-log.test.ts
 */

const TRUNCATE = async () => {
  await db.$executeRaw`
    TRUNCATE
      "ConfirmationSubmission", "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
      "Volunteer", "CommitteeRole", "VolunteerCommittee",
      "EventRegistrant", "Guest", "SmallGroupMemberRequest",
      "SmallGroupLog", "SmallGroup", "Member",
      "EventMinistry", "Event"
    RESTART IDENTITY CASCADE
  `
}

/** Catch Mech scaffold: event + breakout with a lead faci who leads a group. */
async function seedCatchMech(opts: { faciLeadsGroup: boolean }) {
  const event = await db.event.create({
    data: { name: "Summer Camp", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const faciMember = await db.member.create({
    data: { firstName: "Ana", lastName: "Cruz", dateJoined: new Date(), language: [] },
  })
  const group = opts.faciLeadsGroup
    ? await db.smallGroup.create({
        data: { name: "Anchor SG", leaderId: faciMember.id, status: "Active", language: [] },
      })
    : null
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facis", eventId: event.id },
  })
  const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id } })
  const volunteer = await db.volunteer.create({
    data: {
      memberId: faciMember.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  const breakout = await db.breakoutGroup.create({
    data: {
      name: "Table 1",
      eventId: event.id,
      facilitatorId: volunteer.id,
      linkedSmallGroupId: group?.id ?? null,
      language: [],
    },
  })
  const session = await db.catchMechSession.create({
    data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: volunteer.id },
  })
  return { event, faciMember, group, volunteer, breakout, session }
}

async function addGuestRegistrant(eventId: string, breakoutId: string, firstName: string) {
  const guest = await db.guest.create({ data: { firstName, lastName: "Guest", language: [] } })
  const reg = await db.eventRegistrant.create({ data: { eventId, guestId: guest.id } })
  await db.breakoutGroupMember.create({ data: { breakoutGroupId: breakoutId, registrantId: reg.id } })
  return { guest, reg }
}

/** Leader-flow scaffold: a group with a confirmation token and a pending request. */
async function seedLeaderGroup(token: string) {
  const leader = await db.member.create({
    data: { firstName: "Marco", lastName: "Diaz", dateJoined: new Date(), language: [] },
  })
  const group = await db.smallGroup.create({
    data: {
      name: "Anchor SG",
      leaderId: leader.id,
      language: [],
      leaderConfirmationToken: token,
    },
  })
  return { leader, group }
}

async function addPendingRequest(groupId: string, firstName: string) {
  const guest = await db.guest.create({
    data: { firstName, lastName: "Doe", language: [] },
  })
  const request = await db.smallGroupMemberRequest.create({
    data: { smallGroupId: groupId, guestId: guest.id, status: "Pending" },
  })
  return { guest, request }
}

describe("confirmation submission log", () => {
  beforeEach(TRUNCATE)
  afterAll(async () => {
    await db.$disconnect()
  })

  // ─── unit ───────────────────────────────────────────────────────────────────

  describe("unit — tallyDecisions", () => {
    it("counts a mixed batch", () => {
      expect(
        tallyDecisions([
          { status: "confirmed" },
          { status: "confirmed" },
          { status: "declined" },
          { status: "pending" },
        ])
      ).toEqual({ confirmedCount: 2, declinedCount: 1, deferredCount: 1 })
    })

    it("returns zeroes for an empty array", () => {
      expect(tallyDecisions([])).toEqual({
        confirmedCount: 0,
        declinedCount: 0,
        deferredCount: 0,
      })
    })

    it("treats the leader flow's 'rejected' as a decline", () => {
      expect(tallyDecisions([{ status: "rejected" }])).toEqual({
        confirmedCount: 0,
        declinedCount: 1,
        deferredCount: 0,
      })
    })

    it("counts an unrecognised status as deferred rather than dropping it", () => {
      expect(tallyDecisions([{ status: "something-new" }])).toEqual({
        confirmedCount: 0,
        declinedCount: 0,
        deferredCount: 1,
      })
    })
  })

  // ─── integration ────────────────────────────────────────────────────────────

  describe("integration — Catch Mech", () => {
    it("records one submission with the faci's identity and counts", async () => {
      const { event, faciMember, volunteer, breakout, session } = await seedCatchMech({
        faciLeadsGroup: true,
      })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")
      const b = await addGuestRegistrant(event.id, breakout.id, "Bob")

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "confirmed" },
        { registrantId: b.reg.id, status: "declined", declineReason: "NotInterested" },
      ])
      expect(result.success).toBe(true)

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].source).toBe("CatchMech")
      expect(rows[0].eventId).toBe(event.id)
      expect(rows[0].sessionId).toBe(session.id)
      expect(rows[0].breakoutGroupId).toBe(breakout.id)
      expect(rows[0].facilitatorVolunteerId).toBe(volunteer.id)
      expect(rows[0].submittedByMemberId).toBe(faciMember.id)
      expect(rows[0].submittedByName).toBe("Ana Cruz")
      expect(rows[0].confirmedCount).toBe(1)
      expect(rows[0].declinedCount).toBe(1)
      expect(rows[0].deferredCount).toBe(0)
      expect(rows[0].createdGroupId).toBeNull()
    })

    it("round-trips the raw decisions payload", async () => {
      const { event, breakout, session } = await seedCatchMech({ faciLeadsGroup: true })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")

      await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "declined", declineReason: "Others", reason: "moved away" },
      ])

      const row = await db.confirmationSubmission.findFirst()
      const decisions = row?.decisions as { registrantId: string; reason?: string }[]
      expect(decisions).toHaveLength(1)
      expect(decisions[0].registrantId).toBe(a.reg.id)
      expect(decisions[0].reason).toBe("moved away")
    })

    it("stamps the acting facilitator on the SmallGroupLog rows it writes", async () => {
      const { event, faciMember, breakout, session } = await seedCatchMech({
        faciLeadsGroup: true,
      })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")

      await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "confirmed" },
      ])

      const log = await db.smallGroupLog.findFirst({ where: { action: "MemberAdded" } })
      expect(log?.performedByMemberId).toBe(faciMember.id)
    })

    it("records the Timothy path with the group it created", async () => {
      const { event, faciMember, breakout, session } = await seedCatchMech({
        faciLeadsGroup: false,
      })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")

      // A Timothy confirming is asked to name a group first — that intermediate
      // step persists nothing and must not be logged, or the answer double-counts.
      const first = await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "confirmed" },
      ])
      expect(first).toEqual({ success: true, requiresGroupName: true })
      expect(await db.confirmationSubmission.count()).toBe(0)

      const result = await createSmallGroupForTimothy(session.token, "New Group", [
        { registrantId: a.reg.id, status: "confirmed" },
      ])
      expect(result.success).toBe(true)

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].submittedByMemberId).toBe(faciMember.id)
      expect(rows[0].confirmedCount).toBe(1)

      const created = await db.smallGroup.findFirst({ where: { name: "New Group" } })
      expect(rows[0].createdGroupId).toBe(created?.id)
    })
  })

  describe("integration — small group leader", () => {
    it("records one submission with the leader's identity and counts", async () => {
      const { leader, group } = await seedLeaderGroup("tkn-sub-leader")
      const r1 = await addPendingRequest(group.id, "Jane")
      const r2 = await addPendingRequest(group.id, "Bob")

      const result = await submitMemberConfirmations("tkn-sub-leader", [
        { requestId: r1.request.id, status: "confirmed" },
        { requestId: r2.request.id, status: "rejected", notes: "not attending" },
      ])
      expect(result.success).toBe(true)

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].source).toBe("SmallGroupLeader")
      expect(rows[0].smallGroupId).toBe(group.id)
      expect(rows[0].submittedByMemberId).toBe(leader.id)
      expect(rows[0].submittedByName).toBe("Marco Diaz")
      expect(rows[0].confirmedCount).toBe(1)
      expect(rows[0].declinedCount).toBe(1)
      // Catch Mech context stays null on a leader submission.
      expect(rows[0].eventId).toBeNull()
      expect(rows[0].facilitatorVolunteerId).toBeNull()
    })

    it("stamps the acting leader on the SmallGroupLog rows it writes", async () => {
      const { leader, group } = await seedLeaderGroup("tkn-sub-actor")
      const r1 = await addPendingRequest(group.id, "Jane")

      await submitMemberConfirmations("tkn-sub-actor", [
        { requestId: r1.request.id, status: "confirmed" },
      ])

      const logs = await db.smallGroupLog.findMany()
      expect(logs.length).toBeGreaterThan(0)
      for (const log of logs) {
        expect(log.performedByMemberId).toBe(leader.id)
      }
    })
  })

  // ─── regression ─────────────────────────────────────────────────────────────

  describe("regression — submissions that previously left no trace", () => {
    it("records a leader submission where every decision was deferred", async () => {
      const { group } = await seedLeaderGroup("tkn-sub-alldefer")
      const r1 = await addPendingRequest(group.id, "Jane")
      const r2 = await addPendingRequest(group.id, "Bob")

      const result = await submitMemberConfirmations("tkn-sub-alldefer", [
        { requestId: r1.request.id, status: "pending" },
        { requestId: r2.request.id, status: "pending" },
      ])
      expect(result.success).toBe(true)

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].confirmedCount).toBe(0)
      expect(rows[0].declinedCount).toBe(0)
      expect(rows[0].deferredCount).toBe(2)

      // ccf-63's guarantee is unchanged: deferring still writes no group history.
      expect(await db.smallGroupLog.count()).toBe(0)
      // Both requests are still Pending and untouched.
      expect(await db.smallGroupMemberRequest.count({ where: { status: "Pending" } })).toBe(2)
    })

    it("records a groupless Timothy declining everyone", async () => {
      const { event, faciMember, volunteer, breakout, session } = await seedCatchMech({
        faciLeadsGroup: false,
      })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "declined", declineReason: "NotInterested" },
      ])
      expect(result).toEqual({ success: true, requiresGroupName: false })

      // This path has no small group to log against, so before this change it
      // produced zero SmallGroupLog rows and was completely invisible.
      expect(await db.smallGroupLog.count()).toBe(0)

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].facilitatorVolunteerId).toBe(volunteer.id)
      expect(rows[0].submittedByMemberId).toBe(faciMember.id)
      expect(rows[0].declinedCount).toBe(1)
    })

    it("records a groupless submission that declined nobody", async () => {
      const { event, breakout, session } = await seedCatchMech({ faciLeadsGroup: false })
      const a = await addGuestRegistrant(event.id, breakout.id, "Jane")

      const result = await submitCatchMechConfirmations(session.token, [
        { registrantId: a.reg.id, status: "pending" },
      ])
      expect(result).toEqual({ success: true, requiresGroupName: false })

      const rows = await db.confirmationSubmission.findMany()
      expect(rows).toHaveLength(1)
      expect(rows[0].deferredCount).toBe(1)
      expect(await db.smallGroupMemberRequest.count()).toBe(0)
    })

    it("records a leader submission against a group with nothing pending", async () => {
      const { group } = await seedLeaderGroup("tkn-sub-stale")
      const r1 = await addPendingRequest(group.id, "Jane")
      // Resolve it out of band so the submit loop skips it entirely.
      await db.smallGroupMemberRequest.update({
        where: { id: r1.request.id },
        data: { status: "Confirmed", resolvedAt: new Date() },
      })

      const result = await submitMemberConfirmations("tkn-sub-stale", [
        { requestId: r1.request.id, status: "confirmed" },
      ])
      expect(result.success).toBe(true)

      expect(await db.confirmationSubmission.count()).toBe(1)
      expect(await db.smallGroupLog.count()).toBe(0)
    })

    it("records repeat submissions as distinct rows", async () => {
      const { group } = await seedLeaderGroup("tkn-sub-repeat")
      const r1 = await addPendingRequest(group.id, "Jane")

      await submitMemberConfirmations("tkn-sub-repeat", [
        { requestId: r1.request.id, status: "confirmed" },
      ])
      // Second pass writes nothing else — the request is already resolved — but the
      // leader did answer twice and both answers must be visible.
      await submitMemberConfirmations("tkn-sub-repeat", [
        { requestId: r1.request.id, status: "confirmed" },
      ])

      const rows = await db.confirmationSubmission.findMany({ orderBy: { createdAt: "asc" } })
      expect(rows).toHaveLength(2)
      expect(rows[0].id).not.toBe(rows[1].id)
    })

    it("writes no submission row for an unrecognised token", async () => {
      // Rejected before the transaction opens — a bad link is not an answer.
      const result = await submitMemberConfirmations("tkn-does-not-exist", [
        { requestId: "whatever", status: "confirmed" },
      ])
      expect(result.success).toBe(false)
      expect(await db.confirmationSubmission.count()).toBe(0)
    })
  })
})
