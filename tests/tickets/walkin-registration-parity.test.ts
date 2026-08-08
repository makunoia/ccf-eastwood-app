import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

// Walk-in registration parity: the check-in kiosk "Register now" path goes
// through `createRegistrant(..., walkIn)` — the same action as public
// registration — instead of the old stripped-down `walkInCheckin`. These tests
// pin the walk-in-specific behaviors and the bugs the unification fixed:
//  - full matching profile / claimed small group persisted (parity)
//  - guest dedup by lastName + birthMonth + birthYear (parity)
//  - volunteer guard applies to walk-ins (parity)
//  - already-registered is reused + checked in, not an error (kiosk behavior)
//  - email-only walk-in works (old walkInSchema required a mobile number)
//  - paymentReference no longer auto-sets isPaid (admin marks paid manually)

/**
 * Every section and field enabled. `createRegistrant` enforces the form config
 * server-side, so a test that submits optional fields has to be registering
 * against an event whose form actually collects them. Options like
 * `familySpouseOnly` stay off — they restrict a section rather than enable one.
 */
const ALL_FORM_TOGGLES = Object.fromEntries(
  [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS].map((k) => [k, true])
)

const FULLY_COLLECTING_FORM = {
  create: (["Register", "WalkIn", "CheckIn"] as const).map((context) => ({
    context,
    ...ALL_FORM_TOGGLES,
  })),
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "SmallGroupMemberRequest", "SmallGroup", "Guest", "Member", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(type: "OneTime" | "MultiDay" | "Recurring" = "OneTime") {
  return db.event.create({
    data: {
      name: "Parity Event",
      type,
      startDate: new Date(),
      endDate: new Date(),
      formIncludePayment: true,
      // Payment collection now follows the Priced module (CCF-128).
      price: 100000,
      modules: { create: { type: "Priced" } },
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Walk",
    lastName: "In",
    nickname: null,
    email: null,
    mobileNumber: "+63 917 555 0101",
    gender: null,
    birthMonth: null,
    birthYear: null,
    paymentReference: null,
    ...overrides,
  }
}

async function walkIn(
  eventId: string,
  overrides: Record<string, unknown> = {},
  occurrenceId: string | null = null
) {
  return createRegistrant(eventId, payload(overrides), null, null, false, null, {
    occurrenceId,
  })
}

describe("Walk-in registration parity with public registration", () => {
  describe("integration", () => {
    it("session walk-in creates Guest + EventRegistrant + OccurrenceAttendee", async () => {
      const event = await seedEvent("MultiDay")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date() },
        select: { id: true },
      })

      const result = await walkIn(event.id, {}, occurrence.id)
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true, occurrenceAttendances: true },
      })
      expect(registrant?.guest).not.toBeNull()
      expect(registrant?.occurrenceAttendances).toHaveLength(1)
      expect(registrant?.occurrenceAttendances[0]?.occurrenceId).toBe(occurrence.id)
    })

    it("persists the full matching profile and claimed small group on the walk-in Guest", async () => {
      const event = await seedEvent()
      const lifeStage = await db.lifeStage.create({
        data: { name: "Young Pro", order: 1 },
        select: { id: true },
      })
      const leader = await db.member.create({
        data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
        select: { id: true },
      })
      const group = await db.smallGroup.create({
        data: { name: "SG Alpha", leaderId: leader.id },
        select: { id: true },
      })

      const result = await walkIn(event.id, {
        lifeStageId: lifeStage.id,
        gender: "Female",
        language: ["English", "Tagalog"],
        meetingPreference: "Hybrid",
        workCity: "Quezon City",
        scheduleDayOfWeek: 3,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
        claimedSmallGroupId: group.id,
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })
      const guest = registrant?.guest
      expect(guest?.lifeStageId).toBe(lifeStage.id)
      expect(guest?.language).toEqual(["English", "Tagalog"])
      expect(guest?.meetingPreference).toBe("Hybrid")
      expect(guest?.workCity).toBe("Quezon City")
      expect(guest?.scheduleDayOfWeek).toBe(3)
      expect(guest?.scheduleTimeStart).toBe("19:00")
      expect(guest?.claimedSmallGroupId).toBe(group.id)
    })

    it("dedups the Guest by lastName + birthMonth + birthYear when phone/email don't match", async () => {
      const event = await seedEvent()
      const existing = await db.guest.create({
        data: {
          firstName: "Existing",
          lastName: "Person",
          phone: "+63 918 000 0001",
          birthMonth: 5,
          birthYear: 1990,
          language: [],
        },
        select: { id: true },
      })

      // Walk-in with a different phone but same lastName + birthday
      const result = await walkIn(event.id, {
        firstName: "Existing",
        lastName: "Person",
        mobileNumber: "+63 918 000 0002",
        birthMonth: 5,
        birthYear: 1990,
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })
      expect(registrant?.guestId).toBe(existing.id)
      const guests = await db.guest.count({ where: { lastName: "Person" } })
      expect(guests).toBe(1)
    })

    it("blocks event volunteers from walk-in registering, writing nothing", async () => {
      const event = await seedEvent()
      const member = await db.member.create({
        data: {
          firstName: "Vol",
          lastName: "Unteer",
          phone: "+63 917 999 9999",
          dateJoined: new Date(),
          language: [],
        },
        select: { id: true },
      })
      const committee = await db.volunteerCommittee.create({
        data: { name: "Ushering", eventId: event.id },
        select: { id: true },
      })
      const role = await db.committeeRole.create({
        data: { name: "Usher", committeeId: committee.id },
        select: { id: true },
      })
      await db.volunteer.create({
        data: {
          memberId: member.id,
          eventId: event.id,
          committeeId: committee.id,
          preferredRoleId: role.id,
        },
      })

      const result = await createRegistrant(
        event.id,
        payload({ firstName: "Vol", lastName: "Unteer", mobileNumber: "+63 917 999 9999" }),
        member.id,
        null,
        false,
        null,
        { occurrenceId: null }
      )
      expect(result.success).toBe(false)
      expect(await db.eventRegistrant.count()).toBe(0)
    })

    it("walk-in reuses an existing registration and checks it in; plain registration still errors", async () => {
      const event = await seedEvent()
      const mobile = "+63 917 111 2222"

      const first = await createRegistrant(event.id, payload({ mobileNumber: mobile }), null)
      expect(first.success).toBe(true)
      if (!first.success) return

      // Plain registration → duplicate error (existing behavior preserved)
      const dup = await createRegistrant(event.id, payload({ mobileNumber: mobile }), null)
      expect(dup.success).toBe(false)

      // Walk-in → reuse + check in
      const asWalkIn = await walkIn(event.id, { mobileNumber: mobile })
      expect(asWalkIn.success).toBe(true)
      if (!asWalkIn.success) return
      expect(asWalkIn.data.id).toBe(first.data.id)

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: first.data.id },
        select: { attendedAt: true },
      })
      expect(registrant?.attendedAt).not.toBeNull()
      expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
    })

    it("walk-in into an open Recurring session records exactly one OccurrenceAttendee", async () => {
      const event = await seedEvent("Recurring")
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date(), isOpen: true },
        select: { id: true },
      })

      // If walk-in mode didn't skip autoCheckinIfOpenRecurringSession, the
      // second insert for the same occurrence would violate the unique
      // constraint and fail the action.
      const result = await walkIn(event.id, {}, occurrence.id)
      expect(result.success).toBe(true)
      if (!result.success) return

      const attendances = await db.occurrenceAttendee.count({
        where: { registrantId: result.data.id },
      })
      expect(attendances).toBe(1)
    })
  })

  describe("regression", () => {
    it("email-only walk-in (no mobile) succeeds", async () => {
      const event = await seedEvent()
      const result = await walkIn(event.id, {
        mobileNumber: null,
        email: "no-mobile@example.com",
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })
      expect(registrant?.guest?.email).toBe("no-mobile@example.com")
      expect(registrant?.attendedAt).not.toBeNull()
    })

    it("stores paymentReference without marking the walk-in as paid", async () => {
      const event = await seedEvent()
      const result = await walkIn(event.id, { paymentReference: "GCash-12345" })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
      })
      expect(registrant?.isPaid).toBe(false)
      expect(registrant?.paymentReference).toBe("GCash-12345")
    })
  })
})
