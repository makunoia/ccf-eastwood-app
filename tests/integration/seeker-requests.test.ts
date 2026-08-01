import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  SEEKER_REQUEST_WHERE,
  countSeekerRequests,
  createSeekerRequestFromRegistration,
} from "@/lib/small-groups/seeker-requests"
import { dismissSeekerRequest } from "@/app/(dashboard)/small-groups/actions"
import {
  createRegistrant,
  recordSmallGroupInterestAtCheckin,
} from "@/app/(dashboard)/events/actions"

/**
 * Seeker requests (CCF-101) — "I want to join a DGroup" at registration or
 * check-in now becomes a request an admin can see.
 *
 * A seeker is the one request shape with no target group, so these pin both that
 * it gets created and that it stays out of the group-targeted Requests tab and
 * its badge, which have no column that could render it.
 */

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "Event", "EventRegistrant", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name = "Youth Camp") {
  return db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
}

async function seedGuest(firstName = "Maria", lastName = "Santos") {
  return db.guest.create({ data: { firstName, lastName, language: [] } })
}

async function seedMember(firstName = "Juan", lastName = "Cruz", smallGroupId?: string) {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [], smallGroupId },
  })
}

describe("DGroup seeker requests", () => {

  describe("regression — the intent becomes a visible request", () => {
    it("creates a groupless Pending request for a guest", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      const result = await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)
      expect(result.created).toBe(true)

      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: { guestId: guest.id },
      })
      expect(request.status).toBe("Pending")
      expect(request.smallGroupId).toBeNull()
      expect(request.origin).toBe("RegistrationIntent")
      expect(request.sourceEventId).toBe(event.id)
    })

    it("creates the request for a member too", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      await createSeekerRequestFromRegistration({ memberId: member.id }, event.id)

      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: { memberId: member.id },
      })
      expect(request.origin).toBe("RegistrationIntent")
      expect(request.smallGroupId).toBeNull()
    })

    it("the new request is picked up by the seeker query and count", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      expect(await countSeekerRequests()).toBe(1)
      const rows = await db.smallGroupMemberRequest.findMany({ where: SEEKER_REQUEST_WHERE })
      expect(rows).toHaveLength(1)
    })

    it("records which event the ask came from, so admins have context", async () => {
      const event = await seedEvent("Ortigas Summer Conference")
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: { guestId: guest.id },
        include: { sourceEvent: { select: { name: true } } },
      })
      expect(request.sourceEvent?.name).toBe("Ortigas Summer Conference")
    })
  })

  describe("edge cases", () => {
    it("does not raise a second request when one is already pending", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)
      const second = await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      expect(second).toEqual({ created: false, reason: "duplicate" })
      expect(await db.smallGroupMemberRequest.count({ where: { guestId: guest.id } })).toBe(1)
    })

    it("stays quiet when a group-targeted request is already pending", async () => {
      const event = await seedEvent()
      const leader = await seedMember("Leader", "One")
      const group = await db.smallGroup.create({
        data: { name: "Ortigas Young Pro", leaderId: leader.id },
      })
      const guest = await seedGuest()
      await db.smallGroupMemberRequest.create({
        data: { guestId: guest.id, smallGroupId: group.id, status: "Pending" },
      })

      const result = await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      expect(result).toEqual({ created: false, reason: "already-requested" })
      expect(await countSeekerRequests()).toBe(0)
    })

    it("asks again at a later event once the first was resolved", async () => {
      const first = await seedEvent("Camp One")
      const second = await seedEvent("Camp Two")
      const guest = await seedGuest()

      await createSeekerRequestFromRegistration({ guestId: guest.id }, first.id)
      const created = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: { guestId: guest.id },
      })
      await db.smallGroupMemberRequest.update({
        where: { id: created.id },
        data: { status: "Rejected", resolvedAt: new Date() },
      })

      const again = await createSeekerRequestFromRegistration({ guestId: guest.id }, second.id)
      expect(again.created).toBe(true)
      expect(await countSeekerRequests()).toBe(1)
    })

    it("skips a guest already promoted to a member", async () => {
      const event = await seedEvent()
      const member = await seedMember()
      const guest = await db.guest.create({
        data: { firstName: "Maria", lastName: "Santos", language: [], memberId: member.id },
      })

      const result = await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      expect(result).toEqual({ created: false, reason: "promoted-guest" })
      expect(await countSeekerRequests()).toBe(0)
    })

    it("still records a member who is already in a group — most likely a transfer", async () => {
      const event = await seedEvent()
      const leader = await seedMember("Leader", "One")
      const group = await db.smallGroup.create({
        data: { name: "Makati Singles", leaderId: leader.id },
      })
      const member = await seedMember("Juan", "Cruz", group.id)

      const result = await createSeekerRequestFromRegistration({ memberId: member.id }, event.id)
      expect(result.created).toBe(true)
      expect(await countSeekerRequests()).toBe(1)
    })

    it("never throws on a bad person reference — registration must still complete", async () => {
      const event = await seedEvent()
      const result = await createSeekerRequestFromRegistration({ guestId: "nope" }, event.id)
      expect(result).toEqual({ created: false, reason: "error" })
    })

    it("keeps seekers out of the Requests tab query, which needs a target group", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      const requestsTabRows = await db.smallGroupMemberRequest.findMany({
        where: { status: "Pending", smallGroupId: { not: null }, breakoutGroupId: null },
      })
      expect(requestsTabRows).toHaveLength(0)
    })

    it("keeps seekers out of the Requests badge count", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      const requestsBadge = await db.smallGroupMemberRequest.count({
        where: { status: "Pending", breakoutGroupId: null, origin: "Assignment" },
      })
      expect(requestsBadge).toBe(0)
      expect(await countSeekerRequests()).toBe(1)
    })

    it("survives its source event being deleted", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)

      await db.event.delete({ where: { id: event.id } })

      const rows = await db.smallGroupMemberRequest.findMany({ where: SEEKER_REQUEST_WHERE })
      expect(rows).toHaveLength(1)
      expect(rows[0].sourceEventId).toBeNull()
    })
  })

  describe("integration — end to end through createRegistrant", () => {
    async function registerWanting(eventId: string, wantsSmallGroup: boolean) {
      return createRegistrant(eventId, {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        wantsSmallGroup,
      }, null)
    }

    it("a public registration ticking the box lands as a seeker request", async () => {
      const event = await seedEvent()
      await db.eventFormConfig.create({
        data: { eventId: event.id, context: "Register", sectionSmallGroup: true },
      })

      const result = await registerWanting(event.id, true)
      expect(result.success).toBe(true)

      expect(await countSeekerRequests()).toBe(1)
      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: SEEKER_REQUEST_WHERE,
        include: { guest: { select: { firstName: true, phone: true } } },
      })
      expect(request.guest?.firstName).toBe("Maria")
      expect(request.sourceEventId).toBe(event.id)
    })

    it("leaving the box unticked raises nothing", async () => {
      const event = await seedEvent()
      await db.eventFormConfig.create({
        data: { eventId: event.id, context: "Register", sectionSmallGroup: true },
      })

      const result = await registerWanting(event.id, false)
      expect(result.success).toBe(true)
      expect(await countSeekerRequests()).toBe(0)
    })

    it("a crafted intent is ignored when the event's DGroup section is off", async () => {
      const event = await seedEvent()
      // No EventFormConfig row at all — the bare form, DGroup section off.

      const result = await registerWanting(event.id, true)
      expect(result.success).toBe(true)
      expect(await countSeekerRequests()).toBe(0)
    })

    it("registering twice for different events raises only one open request", async () => {
      const first = await seedEvent("Camp One")
      const second = await seedEvent("Camp Two")
      for (const e of [first, second]) {
        await db.eventFormConfig.create({
          data: { eventId: e.id, context: "Register", sectionSmallGroup: true },
        })
      }

      await registerWanting(first.id, true)
      await registerWanting(second.id, true)

      expect(await countSeekerRequests()).toBe(1)
    })
  })

  describe("integration — check-in prompt", () => {
    it("records interest for a guest registered at the event", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await recordSmallGroupInterestAtCheckin(event.id, { guestId: guest.id })
      expect(result.success).toBe(true)
      expect(await countSeekerRequests()).toBe(1)
    })

    it("refuses a guest who is not registered for that event", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      const result = await recordSmallGroupInterestAtCheckin(event.id, { guestId: guest.id })
      expect(result.success).toBe(false)
      expect(await countSeekerRequests()).toBe(0)
    })
  })

  describe("integration — dismissing a seeker", () => {
    it("resolves the request as Rejected rather than deleting it", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)
      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: SEEKER_REQUEST_WHERE,
      })

      const result = await dismissSeekerRequest(request.id)
      expect(result.success).toBe(true)

      const after = await db.smallGroupMemberRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
      expect(after.status).toBe("Rejected")
      expect(after.resolvedAt).not.toBeNull()
      expect(await countSeekerRequests()).toBe(0)
    })

    it("refuses to dismiss a group-targeted request", async () => {
      const leader = await seedMember("Leader", "One")
      const group = await db.smallGroup.create({
        data: { name: "Ortigas Young Pro", leaderId: leader.id },
      })
      const guest = await seedGuest()
      const request = await db.smallGroupMemberRequest.create({
        data: { guestId: guest.id, smallGroupId: group.id, status: "Pending" },
      })

      const result = await dismissSeekerRequest(request.id)
      expect(result.success).toBe(false)

      const after = await db.smallGroupMemberRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
      expect(after.status).toBe("Pending")
    })

    it("refuses to dismiss twice", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()
      await createSeekerRequestFromRegistration({ guestId: guest.id }, event.id)
      const request = await db.smallGroupMemberRequest.findFirstOrThrow({
        where: SEEKER_REQUEST_WHERE,
      })

      await dismissSeekerRequest(request.id)
      const second = await dismissSeekerRequest(request.id)
      expect(second.success).toBe(false)
    })

    it("refuses an unknown request id", async () => {
      const result = await dismissSeekerRequest("no-such-request")
      expect(result.success).toBe(false)
    })
  })
})
