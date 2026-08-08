import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "test-admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
  }),
}))

import { db } from "@/lib/db"
import {
  resolveDuplicateGroup,
  resolveDuplicateGroups,
} from "@/app/(dashboard)/settings/duplicate-profiles/actions"

afterAll(async () => {
  await db.$disconnect()
})

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "EventRegistrant",
    "Event", "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "SmallGroupMemberRequest", "SmallGroupLog", "SmallGroup",
    "MemberLog", "SchedulePreference", "Guest", "Member", "LifeStage"
    RESTART IDENTITY CASCADE`
})

async function seedMember(overrides: Partial<{
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  address: string | null
  birthYear: number | null
  workCity: string | null
}> = {}) {
  return db.member.create({
    data: {
      firstName: overrides.firstName ?? "Juan",
      lastName: overrides.lastName ?? "Cruz",
      email: overrides.email ?? null,
      phone: overrides.phone ?? null,
      address: overrides.address ?? null,
      birthYear: overrides.birthYear ?? null,
      workCity: overrides.workCity ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

async function seedGuest(overrides: Partial<{
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  workCity: string | null
  birthYear: number | null
}> = {}) {
  return db.guest.create({
    data: {
      firstName: overrides.firstName ?? "Juan",
      lastName: overrides.lastName ?? "Cruz",
      email: overrides.email ?? null,
      phone: overrides.phone ?? null,
      workCity: overrides.workCity ?? null,
      birthYear: overrides.birthYear ?? null,
      language: [],
    },
  })
}

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-01"),
    },
  })
}

describe("resolveDuplicateGroup", () => {
  describe("member → member", () => {
    it("merges loser into keeper, transferring event registrations", async () => {
      const keeper = await seedMember({ email: "k@example.com" })
      const loser = await seedMember({ email: "l@example.com" })
      const event = await seedEvent()

      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: keeper.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: loser.id } })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(result).toEqual({ success: true, data: { merged: 1 } })
      expect(await db.member.findUnique({ where: { id: loser.id } })).toBeNull()
      expect(await db.eventRegistrant.count({ where: { memberId: keeper.id } })).toBe(2)
    })

    it("fills the keeper's null fields from the loser (keeper still wins on conflicts)", async () => {
      const keeper = await seedMember({ firstName: "Juan", workCity: null, birthYear: null, address: "Keeper Address" })
      const loser = await seedMember({ firstName: "Jon",  workCity: "Makati", birthYear: 1995, address: "Loser Address" })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(result.success).toBe(true)
      const merged = await db.member.findUnique({ where: { id: keeper.id } })
      // Filled from loser because keeper was null
      expect(merged?.workCity).toBe("Makati")
      expect(merged?.birthYear).toBe(1995)
      // Keeper wins because it already had a value
      expect(merged?.firstName).toBe("Juan")
      expect(merged?.address).toBe("Keeper Address")
    })

    it("fills a unique field (email) from the loser without a unique-constraint collision", async () => {
      // Phone-grouped duplicate: keeper has no email, loser does. Filling the
      // keeper's email from the loser must not collide with the loser's own
      // still-present email (the bug — loser was deleted after the keeper update).
      const keeper = await seedMember({ phone: "+639170000099", email: null })
      const loser = await seedMember({ phone: "+639170000099", email: "loser@example.com", firstName: "Maria" })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(result.success).toBe(true)
      const merged = await db.member.findUnique({ where: { id: keeper.id } })
      expect(merged?.email).toBe("loser@example.com")
      expect(await db.member.findUnique({ where: { id: loser.id } })).toBeNull()
    })

    it("re-points groups led by the loser to the keeper", async () => {
      const keeper = await seedMember()
      const loser = await seedMember({ firstName: "Maria" })
      const group = await db.smallGroup.create({
        data: { name: "Loser-led Group", leaderId: loser.id },
      })

      await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
      expect(updated?.leaderId).toBe(keeper.id)
    })

    it("transfers schedule preferences and volunteer rows", async () => {
      const keeper = await seedMember()
      const loser = await seedMember({ firstName: "Maria" })
      const event = await seedEvent()
      const committee = await db.volunteerCommittee.create({
        data: { name: "Hospitality", eventId: event.id },
      })
      const role = await db.committeeRole.create({
        data: { name: "Greeter", committeeId: committee.id },
      })
      await db.volunteer.create({
        data: {
          memberId: loser.id,
          eventId: event.id,
          committeeId: committee.id,
          preferredRoleId: role.id,
        },
      })
      await db.schedulePreference.create({
        data: { memberId: loser.id, dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" },
      })

      await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(await db.volunteer.count({ where: { memberId: keeper.id } })).toBe(1)
      expect(await db.volunteer.count({ where: { memberId: loser.id } })).toBe(0)
      expect(await db.schedulePreference.count({ where: { memberId: keeper.id } })).toBe(1)
      expect(await db.member.findUnique({ where: { id: loser.id } })).toBeNull()
    })

    it("folds the loser's promoted guest into the keeper's existing guest (unique Guest.memberId)", async () => {
      // Both members already retain a linked guest. `Guest.memberId` is unique, so
      // re-pointing the loser's guest naively would hit P2002 — it must fold instead.
      const keeper = await seedMember()
      const loser = await seedMember({ firstName: "Maria" })
      const event = await seedEvent()

      const keeperGuest = await db.guest.create({
        data: { firstName: "K", lastName: "G", memberId: keeper.id, language: [] },
      })
      const loserGuest = await db.guest.create({
        data: { firstName: "L", lastName: "G", memberId: loser.id, workCity: "Cebu", language: [] },
      })
      // The loser's guest owns history that must survive the fold.
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: loserGuest.id } })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(result.success).toBe(true)
      // Loser's guest folded away; keeper keeps exactly one linked guest.
      expect(await db.guest.findUnique({ where: { id: loserGuest.id } })).toBeNull()
      const guests = await db.guest.findMany({ where: { memberId: keeper.id } })
      expect(guests).toHaveLength(1)
      expect(guests[0].id).toBe(keeperGuest.id)
      // Activity preserved: the folded guest's registration moved to the keeper's guest.
      expect(await db.eventRegistrant.count({ where: { guestId: keeperGuest.id } })).toBe(1)
      // Blank profile fields filled from the folded guest.
      expect(guests[0].workCity).toBe("Cebu")
    })
  })

  describe("guest → guest", () => {
    it("merges and transfers event registrations", async () => {
      const keeper = await seedGuest({ email: "k@example.com" })
      const loser = await seedGuest({ email: "l@example.com" })
      const event = await seedEvent()

      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: keeper.id } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: loser.id } })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "guest",
        losers: [{ id: loser.id, type: "guest" }],
      })

      expect(result).toEqual({ success: true, data: { merged: 1 } })
      expect(await db.guest.findUnique({ where: { id: loser.id } })).toBeNull()
      expect(await db.eventRegistrant.count({ where: { guestId: keeper.id } })).toBe(2)
    })

    it("fills a unique field (email) from the loser without a unique-constraint collision", async () => {
      const keeper = await seedGuest({ phone: "+639170000098", email: null })
      const loser = await seedGuest({ phone: "+639170000098", email: "loser@example.com", firstName: "Anna" })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "guest",
        losers: [{ id: loser.id, type: "guest" }],
      })

      expect(result.success).toBe(true)
      const merged = await db.guest.findUnique({ where: { id: keeper.id } })
      expect(merged?.email).toBe("loser@example.com")
      expect(await db.guest.findUnique({ where: { id: loser.id } })).toBeNull()
    })

    it("inherits the loser's promotion link onto the keeper without a collision (ordering)", async () => {
      // Loser guest is already promoted; keeper is not. The keeper must inherit the
      // loser's memberId only AFTER the loser is deleted — otherwise both rows hold
      // the same unique Guest.memberId at once (P2002).
      const member = await seedMember()
      const keeper = await seedGuest()
      const loser = await seedGuest({ firstName: "Promoted" })
      await db.guest.update({ where: { id: loser.id }, data: { memberId: member.id } })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "guest",
        losers: [{ id: loser.id, type: "guest" }],
      })

      expect(result.success).toBe(true)
      expect(await db.guest.findUnique({ where: { id: loser.id } })).toBeNull()
      const merged = await db.guest.findUnique({ where: { id: keeper.id } })
      expect(merged?.memberId).toBe(member.id)
    })

    it("rejects merging a member into a guest keeper", async () => {
      const member = await seedMember()
      const guest = await seedGuest()

      const result = await resolveDuplicateGroup({
        keeperId: guest.id,
        keeperType: "guest",
        losers: [{ id: member.id, type: "member" }],
      })

      expect(result.success).toBe(false)
      // Original records intact
      expect(await db.member.findUnique({ where: { id: member.id } })).not.toBeNull()
      expect(await db.guest.findUnique({ where: { id: guest.id } })).not.toBeNull()
    })
  })

  describe("guest → member (promotion-like)", () => {
    it("links the guest to the member, moves its registrations, and retains the guest record", async () => {
      const member = await seedMember({ email: "same@example.com", workCity: null })
      const guest = await seedGuest({ email: "same@example.com", workCity: "Makati" })
      const event = await seedEvent()
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await resolveDuplicateGroup({
        keeperId: member.id,
        keeperType: "member",
        losers: [{ id: guest.id, type: "guest" }],
      })

      expect(result.success).toBe(true)

      const updatedGuest = await db.guest.findUnique({ where: { id: guest.id } })
      // Guest is retained for history, now linked to the member
      expect(updatedGuest?.memberId).toBe(member.id)

      // Event registrations re-pointed to the member
      const registrants = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(registrants).toHaveLength(1)
      expect(registrants[0].memberId).toBe(member.id)
      expect(registrants[0].guestId).toBeNull()

      // Filled blanks
      const updatedMember = await db.member.findUnique({ where: { id: member.id } })
      expect(updatedMember?.workCity).toBe("Makati")
    })

    it("folds the loser guest in when the keeper member already retains a guest (unique Guest.memberId)", async () => {
      // The keeper member already has a linked guest from a prior promotion, so the
      // loser guest can't also link (unique memberId) — its history goes to the
      // member and its profile folds into the existing guest before it's dropped.
      const member = await seedMember()
      const event = await seedEvent()
      const existingGuest = await db.guest.create({
        data: { firstName: "Old", lastName: "Guest", memberId: member.id, language: [] },
      })
      const loserGuest = await seedGuest({ workCity: "Davao" })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: loserGuest.id } })

      const result = await resolveDuplicateGroup({
        keeperId: member.id,
        keeperType: "member",
        losers: [{ id: loserGuest.id, type: "guest" }],
      })

      expect(result.success).toBe(true)
      // Loser guest dropped; member still has exactly one linked guest.
      expect(await db.guest.findUnique({ where: { id: loserGuest.id } })).toBeNull()
      const guests = await db.guest.findMany({ where: { memberId: member.id } })
      expect(guests).toHaveLength(1)
      expect(guests[0].id).toBe(existingGuest.id)
      // Registration re-pointed to the keeper member.
      const reg = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
      expect(reg).toHaveLength(1)
      expect(reg[0].memberId).toBe(member.id)
      expect(reg[0].guestId).toBeNull()
    })
  })

  describe("authorization", () => {
    it("rejects callers that are not Super Admin", async () => {
      const { auth } = await import("@/lib/auth")
      const mockedAuth = auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }
      mockedAuth.mockResolvedValueOnce({
        user: { id: "staff", role: "Staff", permissions: [], eventAccess: [] },
      })

      const keeper = await seedMember()
      const loser = await seedMember({ firstName: "Maria" })

      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: loser.id, type: "member" }],
      })

      expect(result).toEqual({ success: false, error: "Unauthorized" })
      // Both still exist — no destructive action ran
      expect(await db.member.findUnique({ where: { id: keeper.id } })).not.toBeNull()
      expect(await db.member.findUnique({ where: { id: loser.id } })).not.toBeNull()
    })
  })

  describe("batch — resolveDuplicateGroups", () => {
    it("merges multiple groups in a single call and reports per-item results", async () => {
      // Group 1: phone duplicate between two Members
      const a1 = await seedMember({ email: "a1@example.com", phone: "+639170000001" })
      const a2 = await seedMember({ email: "a2@example.com", phone: "+639170000001", firstName: "Maria" })
      // Group 2: email duplicate between two Guests
      const b1 = await seedGuest({ email: "shared@example.com" })
      const b2 = await seedGuest({ email: "shared@example.com", firstName: "Anna" })

      const result = await resolveDuplicateGroups([
        { keeperId: a1.id, keeperType: "member", losers: [{ id: a2.id, type: "member" }] },
        { keeperId: b1.id, keeperType: "guest",  losers: [{ id: b2.id, type: "guest"  }] },
      ])

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.total).toBe(2)
      expect(result.data.succeeded).toBe(2)
      expect(result.data.failed).toBe(0)
      expect(result.data.totalMerged).toBe(2)

      expect(await db.member.findUnique({ where: { id: a2.id } })).toBeNull()
      expect(await db.guest.findUnique({ where: { id: b2.id } })).toBeNull()
    })

    it("isolates failures — a bad group does not roll back successful ones", async () => {
      const a1 = await seedMember({ email: "ok@example.com" })
      const a2 = await seedMember({ email: "ok2@example.com", firstName: "Maria" })
      const event = await seedEvent()
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: a2.id } })

      const result = await resolveDuplicateGroups([
        // Valid merge
        { keeperId: a1.id, keeperType: "member", losers: [{ id: a2.id, type: "member" }] },
        // Bad input — keeper appears in losers list
        { keeperId: a1.id, keeperType: "member", losers: [{ id: a1.id, type: "member" }] },
      ])

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.succeeded).toBe(1)
      expect(result.data.failed).toBe(1)
      const okItem = result.data.items[0]
      const badItem = result.data.items[1]
      expect(okItem.success).toBe(true)
      expect(badItem.success).toBe(false)

      // The first merge committed — registrant moved to keeper, loser deleted
      expect(await db.member.findUnique({ where: { id: a2.id } })).toBeNull()
      expect(await db.eventRegistrant.count({ where: { memberId: a1.id } })).toBe(1)
    })

    it("rejects an empty input list", async () => {
      const result = await resolveDuplicateGroups([])
      expect(result).toEqual({ success: false, error: "Nothing to merge" })
    })

    it("rejects non-Super-Admin callers", async () => {
      const { auth } = await import("@/lib/auth")
      const mockedAuth = auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }
      mockedAuth.mockResolvedValueOnce({
        user: { id: "staff", role: "Staff", permissions: [], eventAccess: [] },
      })

      const a1 = await seedMember()
      const a2 = await seedMember({ firstName: "Maria" })

      const result = await resolveDuplicateGroups([
        { keeperId: a1.id, keeperType: "member", losers: [{ id: a2.id, type: "member" }] },
      ])

      expect(result).toEqual({ success: false, error: "Unauthorized" })
      expect(await db.member.findUnique({ where: { id: a2.id } })).not.toBeNull()
    })
  })

  describe("input guards", () => {
    it("rejects an empty losers list", async () => {
      const keeper = await seedMember()
      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [],
      })
      expect(result).toEqual({ success: false, error: "No records to merge" })
    })

    it("rejects the keeper appearing in the losers list", async () => {
      const keeper = await seedMember()
      const result = await resolveDuplicateGroup({
        keeperId: keeper.id,
        keeperType: "member",
        losers: [{ id: keeper.id, type: "member" }],
      })
      expect(result.success).toBe(false)
    })
  })
})
