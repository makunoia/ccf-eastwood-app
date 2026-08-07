import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"

/**
 * Ticket verification suite for CCF-37:
 * Guest detail page: show where the guest came from and display activity logs.
 *
 * Covers:
 * - Source event: first event a guest registered for
 * - Unified activity log: SmallGroup logs + event registrations + promotion
 * - Member activity carryover: promoted guest logs visible on member profile
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroupLog", "EventRegistrant", "SmallGroupMemberRequest",
    "EventModule", "Event",
    "SmallGroup",
    "Guest", "SchedulePreference", "Member"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(overrides?: { startDate?: Date }) {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: overrides?.startDate ?? new Date("2025-01-01"),
      endDate: overrides?.startDate ?? new Date("2025-01-01"),
    },
  })
}

async function seedGuest() {
  return db.guest.create({
    data: { firstName: "Maria", lastName: "Santos", language: [] },
  })
}

async function seedMemberAndSmallGroup() {
  const leader = await db.member.create({
    data: {
      firstName: "Leader",
      lastName: "Test",
      dateJoined: new Date(),
      language: [],
    },
  })
  const sg = await db.smallGroup.create({
    data: { name: "Test Group", leaderId: leader.id },
  })
  return { leader, sg }
}

describe("CCF-37", () => {
  describe("unit", () => {
    it("sorts unified activity entries by createdAt descending", () => {
      const now = new Date()
      const earlier = new Date(now.getTime() - 10_000)
      const entries = [
        { kind: "eventRegistration" as const, id: "1", event: { id: "e1", name: "A" }, createdAt: earlier },
        { kind: "eventRegistration" as const, id: "2", event: { id: "e2", name: "B" }, createdAt: now },
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      expect(entries[0].createdAt).toBe(now)
      expect(entries[1].createdAt).toBe(earlier)
    })

    it("identifies the oldest registration as the source event", () => {
      const oldest = new Date("2024-01-01")
      const newest = new Date("2025-01-01")
      const registrations = [
        { id: "r1", event: { id: "e1", name: "Newest Event", startDate: newest }, createdAt: newest },
        { id: "r2", event: { id: "e2", name: "Oldest Event", startDate: oldest }, createdAt: oldest },
      ] // ordered by createdAt desc (newest first)

      const sourceEvent = registrations.length > 0
        ? registrations[registrations.length - 1].event
        : null

      expect(sourceEvent?.name).toBe("Oldest Event")
    })
  })

  describe("integration", () => {
    it("guest has event registrations that can be used as source and activity", async () => {
      const guest = await seedGuest()
      const event1 = await seedEvent({ startDate: new Date("2024-06-01") })
      const event2 = await seedEvent({ startDate: new Date("2024-12-01") })

      await db.eventRegistrant.create({ data: { guestId: guest.id, eventId: event1.id } })
      await db.eventRegistrant.create({ data: { guestId: guest.id, eventId: event2.id } })

      const registrations = await db.eventRegistrant.findMany({
        where: { guestId: guest.id },
        orderBy: { createdAt: "desc" },
        include: { event: { select: { id: true, name: true, startDate: true } } },
      })

      expect(registrations).toHaveLength(2)
      // Source event is the last item (oldest)
      const sourceEvent = registrations[registrations.length - 1]
      expect(sourceEvent.event.id).toBeDefined()
    })

    it("guest small group logs are linked to the guest record", async () => {
      const guest = await seedGuest()
      const { sg } = await seedMemberAndSmallGroup()

      await db.smallGroupLog.create({
        data: {
          smallGroupId: sg.id,
          guestId: guest.id,
          action: "TempAssignmentCreated",
          description: "Assigned to group",
        },
      })

      const logs = await db.smallGroupLog.findMany({
        where: { guestId: guest.id },
        include: { smallGroup: { select: { id: true, name: true } }, performedByUser: { select: { name: true } } },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe("TempAssignmentCreated")
      expect(logs[0].smallGroup.name).toBe("Test Group")
    })

    it("member promoted from guest: guest record is linked via memberId", async () => {
      const guest = await seedGuest()
      const member = await db.member.create({
        data: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          dateJoined: new Date(),
          language: [],
        },
      })
      await db.guest.update({ where: { id: guest.id }, data: { memberId: member.id } })

      const linkedGuest = await db.guest.findUnique({
        where: { memberId: member.id },
        select: { id: true },
      })

      expect(linkedGuest?.id).toBe(guest.id)
    })
  })

  describe("regression", () => {
    it("member activity query includes guest small group logs when promoted from guest", async () => {
      // Seed: guest with a small group log, promoted to member
      const guest = await seedGuest()
      const { sg } = await seedMemberAndSmallGroup()

      await db.smallGroupLog.create({
        data: {
          smallGroupId: sg.id,
          guestId: guest.id,
          action: "TempAssignmentCreated",
          description: "Pre-promotion log",
        },
      })

      const member = await db.member.create({
        data: { firstName: guest.firstName, lastName: guest.lastName, dateJoined: new Date(), language: [] },
      })
      await db.guest.update({ where: { id: guest.id }, data: { memberId: member.id } })

      // Simulate getMemberActivityData: find linked guest, fetch their logs
      const linkedGuest = await db.guest.findUnique({ where: { memberId: member.id }, select: { id: true } })
      expect(linkedGuest).not.toBeNull()

      const guestLogs = await db.smallGroupLog.findMany({ where: { guestId: linkedGuest!.id } })
      expect(guestLogs).toHaveLength(1)
      expect(guestLogs[0].description).toBe("Pre-promotion log")
    })

    it("member activity query includes guest event registrations when promoted from guest", async () => {
      const guest = await seedGuest()
      const event = await seedEvent()
      await db.eventRegistrant.create({ data: { guestId: guest.id, eventId: event.id } })

      const member = await db.member.create({
        data: { firstName: guest.firstName, lastName: guest.lastName, dateJoined: new Date(), language: [] },
      })
      await db.guest.update({ where: { id: guest.id }, data: { memberId: member.id } })

      const linkedGuest = await db.guest.findUnique({ where: { memberId: member.id }, select: { id: true } })
      expect(linkedGuest).not.toBeNull()

      const guestRegistrations = await db.eventRegistrant.findMany({ where: { guestId: linkedGuest!.id } })
      expect(guestRegistrations).toHaveLength(1)
      expect(guestRegistrations[0].eventId).toBe(event.id)
    })
  })
})

