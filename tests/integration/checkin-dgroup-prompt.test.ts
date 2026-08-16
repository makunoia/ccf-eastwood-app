/**
 * The check-in DGroup prompt, for everyone who has no DGroup — not just guests.
 *
 * Two gaps this pins:
 *   1. A member with `smallGroupId = null` (added directly by an admin, or one
 *      who left a group) was never asked, at check-in or as a volunteer, even
 *      though the public registration form asks that exact person.
 *   2. The prompt's writes called admin actions gated on `requireWrite()`, which
 *      no unauthenticated kiosk can satisfy — every save failed with
 *      "Not authenticated." The kiosk actions are scoped by event attendance
 *      instead, so they must work with no session at all.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  lookupCheckinRegistrant,
  recordSmallGroupInterestAtCheckin,
  saveCheckinMatchingProfile,
  saveCheckinClaimedGroup,
} from "@/app/(dashboard)/events/actions"

const PHONE = "+63 917 123 4567"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SchedulePreference", "Event", "EventRegistrant", "Volunteer", "VolunteerCommittee", "CommitteeRole", "EventFormConfig" RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue({
    user: { id: "u1", role: "SuperAdmin" },
  } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await db.$disconnect()
})

/**
 * The Check-in profile step only writes fields its form config enables (CCF-142),
 * and the DGroup prompt only appears when `sectionSmallGroup` is on — so an event
 * running this flow always has a config row. Seeding one here matches what the
 * kiosk actually renders; without it the profile writes are correctly no-ops.
 */
async function seedEvent() {
  const event = await db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
  await db.eventFormConfig.create({
    data: {
      eventId: event.id,
      context: "CheckIn",
      sectionSmallGroup: true,
      fieldLifeStage: true,
      fieldGender: true,
      fieldAgeRange: true,
      fieldLanguage: true,
      fieldMeetingPreference: true,
      fieldSchedule: true,
      fieldWorkCity: true,
    },
  })
  return event
}

function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Ana",
      lastName: "Reyes",
      phone: PHONE,
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
  })
}

async function seedGroup(name = "Ortigas Young Pro") {
  const leader = await db.member.create({
    data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
  })
  return db.smallGroup.create({ data: { name, leaderId: leader.id, language: [] } })
}

/** The single-match branch of the lookup, or a failed assertion. */
async function lookupPrompt(eventId: string) {
  const res = await lookupCheckinRegistrant(eventId, PHONE, null)
  expect(res.success).toBe(true)
  if (!res.success || !res.data || "matchType" in res.data) {
    throw new Error("expected a single match")
  }
  return res.data.smallGroupPrompt
}

describe("check-in DGroup prompt — members", () => {
  it("asks a registered member who is not in a DGroup", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const prompt = await lookupPrompt(event.id)
    expect(prompt?.person).toEqual({ memberId: member.id })
  })

  it("stays quiet for a member who already has a DGroup", async () => {
    const event = await seedEvent()
    const group = await seedGroup()
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Member" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    expect(await lookupPrompt(event.id)).toBeNull()
  })

  it("stays quiet for a member already waiting on placement", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, status: "Pending", origin: "RegistrationIntent" },
    })

    expect(await lookupPrompt(event.id)).toBeNull()
  })

  /**
   * Regression: "open request" once meant `Pending || Confirmed`, but a Confirmed
   * request keeps its row forever — every removal path only nulls
   * `Member.smallGroupId`. So a member who joined a DGroup and later left carried
   * a resolved Confirmed row that silenced this prompt permanently, which is
   * exactly the person it exists for.
   */
  it("asks a member who left the DGroup they were once confirmed into", async () => {
    const event = await seedEvent()
    const group = await seedGroup()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.smallGroupMemberRequest.create({
      data: {
        memberId: member.id,
        smallGroupId: group.id,
        status: "Confirmed",
        resolvedAt: new Date(),
      },
    })
    // What every removal path leaves behind: no group, but the old row intact.
    await db.member.update({
      where: { id: member.id },
      data: { smallGroupId: null, groupStatus: null },
    })

    const prompt = await lookupPrompt(event.id)
    expect(prompt?.person).toEqual({ memberId: member.id })
  })

  it("stays quiet for a Confirmed request that has not been resolved yet", async () => {
    const event = await seedEvent()
    const group = await seedGroup()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, smallGroupId: group.id, status: "Confirmed" },
    })

    expect(await lookupPrompt(event.id)).toBeNull()
  })

  it("asks again once a request has been rejected", async () => {
    const event = await seedEvent()
    const group = await seedGroup()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.smallGroupMemberRequest.create({
      data: {
        memberId: member.id,
        smallGroupId: group.id,
        status: "Rejected",
        resolvedAt: new Date(),
      },
    })

    expect((await lookupPrompt(event.id))?.person).toEqual({ memberId: member.id })
  })

  it("carries the member's stored schedule into the prompt", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.schedulePreference.create({
      data: { memberId: member.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const prompt = await lookupPrompt(event.id)
    // Members keep availability in a relation; the kiosk edits one slot, so the
    // prompt has to flatten it or the form comes up blank and overwrites it.
    expect(prompt?.existingProfile.scheduleDayOfWeek).toBe(2)
    expect(prompt?.existingProfile.scheduleTimeStart).toBe("19:00")
    expect(prompt?.existingProfile.scheduleTimeEnd).toBe("21:00")
  })

  it("asks a volunteer whose member record has no DGroup", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const committee = await db.volunteerCommittee.create({
      data: { name: "Logistics", eventId: event.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
    })
    await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })

    const prompt = await lookupPrompt(event.id)
    expect(prompt?.person).toEqual({ memberId: member.id })
  })

  it("stays quiet for a member who named another CCF satellite", async () => {
    const event = await seedEvent()
    const member = await seedMember({ upwardSatellite: "CCF Cebu" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    // The member-side twin of a guest's `claimedSatellite`: they have already
    // said they're in a DGroup, there is just no local group to link. Asking
    // again at the kiosk would be asking a question they answered.
    expect(await lookupPrompt(event.id)).toBeNull()
  })
})

/**
 * "I'm already in one" for a member — the branch that was guest-only because a
 * member had nowhere to put the answer. It now goes where the member portal puts
 * the same answer, and the rule it must not break is that a self-report at an
 * unauthenticated kiosk never becomes membership.
 */
describe("check-in claim — members", () => {
  it("turns a member's claim into a Pending request, not a placement", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const group = await seedGroup()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const res = await saveCheckinClaimedGroup(event.id, { memberId: member.id }, group.id)
    expect(res.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: member.id },
    })
    expect(request.smallGroupId).toBe(group.id)
    expect(request.status).toBe("Pending")

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.smallGroupId).toBeNull()
  })

  it("reports success when the answer is already on file", async () => {
    const event = await seedEvent()
    const group = await seedGroup()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, smallGroupId: group.id, status: "Pending" },
    })

    // Tapping through a second time must not tell someone at a kiosk that their
    // correct answer failed — and must not stack a duplicate row either.
    const res = await saveCheckinClaimedGroup(event.id, { memberId: member.id }, group.id)
    expect(res.success).toBe(true)
    expect(await db.smallGroupMemberRequest.count({ where: { memberId: member.id } })).toBe(1)
  })

  it("refuses a member who is not attending this event", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const group = await seedGroup()
    // No registrant row and no volunteer row: event attendance is the only thing
    // scoping these public writes.

    const res = await saveCheckinClaimedGroup(event.id, { memberId: member.id }, group.id)
    expect(res.success).toBe(false)
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  /**
   * `searchMembersForLeaderLookup` doesn't filter `ledGroups` by status, so a
   * retired group really is offered at the kiosk. Both record types have to
   * refuse it the same way — the member branch used to report success while
   * `recordMemberGroupClaim` quietly declined (a Pending request against a dead
   * group has nobody to confirm it), and the guest branch stored the claim.
   */
  describe("an inactive DGroup", () => {
    it("is refused for a member rather than silently dropped", async () => {
      const event = await seedEvent()
      const member = await seedMember()
      const group = await seedGroup()
      await db.smallGroup.update({ where: { id: group.id }, data: { status: "Inactive" } })
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      const res = await saveCheckinClaimedGroup(event.id, { memberId: member.id }, group.id)
      expect(res.success).toBe(false)
      expect(await db.smallGroupMemberRequest.count({ where: { memberId: member.id } })).toBe(0)
    })

    it("is refused for a guest too, so both answers land the same way", async () => {
      const event = await seedEvent()
      const guest = await db.guest.create({
        data: { firstName: "Maria", lastName: "Santos", phone: PHONE, language: [] },
      })
      const group = await seedGroup()
      await db.smallGroup.update({ where: { id: group.id }, data: { status: "Inactive" } })
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const res = await saveCheckinClaimedGroup(event.id, { guestId: guest.id }, group.id)
      expect(res.success).toBe(false)
      const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
      expect(after.claimedSmallGroupId).toBeNull()
    })
  })
})

describe("check-in DGroup prompt — guest behavior is unchanged", () => {
  async function seedGuestRegistrant(overrides: Record<string, unknown> = {}) {
    const event = await seedEvent()
    const guest = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", phone: PHONE, language: [], ...overrides },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    return { event, guest }
  }

  it("asks a guest who has claimed nothing", async () => {
    const { event, guest } = await seedGuestRegistrant()

    const prompt = await lookupPrompt(event.id)
    expect(prompt?.person).toEqual({ guestId: guest.id })
  })

  it("stays quiet for a guest who claimed a group", async () => {
    const group = await seedGroup()
    const { event } = await seedGuestRegistrant({ claimedSmallGroupId: group.id })

    expect(await lookupPrompt(event.id)).toBeNull()
  })
})

describe("check-in DGroup writes work with no session", () => {
  // The kiosk is a public page. Everything below must pass with `auth()`
  // returning null — that is the regression.
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>)
  })

  it("records a member's interest as a seeker request", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const res = await recordSmallGroupInterestAtCheckin(event.id, { memberId: member.id })
    expect(res.success).toBe(true)
    const request = await db.smallGroupMemberRequest.findFirst({ where: { memberId: member.id } })
    expect(request?.status).toBe("Pending")
    expect(request?.smallGroupId).toBeNull()
    expect(request?.sourceEventId).toBe(event.id)
  })

  it("saves a member's matching profile, schedule included", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const res = await saveCheckinMatchingProfile(
      event.id,
      { memberId: member.id },
      {
        gender: "Female",
        language: ["English"],
        meetingPreference: "InPerson",
        workCity: "Pasig",
        scheduleDayOfWeek: 3,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      }
    )
    expect(res.success).toBe(true)

    const saved = await db.member.findUnique({
      where: { id: member.id },
      include: { schedulePreferences: true },
    })
    expect(saved?.gender).toBe("Female")
    expect(saved?.language).toEqual(["English"])
    expect(saved?.meetingPreference).toBe("InPerson")
    expect(saved?.workCity).toBe("Pasig")
    expect(saved?.schedulePreferences).toHaveLength(1)
    expect(saved?.schedulePreferences[0]).toMatchObject({
      dayOfWeek: 3,
      timeStart: "19:00",
      timeEnd: "21:00",
    })
  })

  it("replaces rather than duplicates a member's schedule on a second save", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    await db.schedulePreference.create({
      data: { memberId: member.id, dayOfWeek: 1, timeStart: "18:00", timeEnd: "20:00" },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    await saveCheckinMatchingProfile(
      event.id,
      { memberId: member.id },
      { scheduleDayOfWeek: 5, scheduleTimeStart: "20:00", scheduleTimeEnd: "22:00" }
    )

    const slots = await db.schedulePreference.findMany({ where: { memberId: member.id } })
    expect(slots).toHaveLength(1)
    expect(slots[0].dayOfWeek).toBe(5)
  })

  it("leaves unsent columns alone", async () => {
    const event = await seedEvent()
    const member = await seedMember({ workCity: "Makati", gender: "Female" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    await saveCheckinMatchingProfile(event.id, { memberId: member.id }, { workCity: "Pasig" })

    const saved = await db.member.findUnique({ where: { id: member.id } })
    expect(saved?.workCity).toBe("Pasig")
    expect(saved?.gender).toBe("Female")
  })

  it("saves a guest's matching profile and claimed group", async () => {
    const event = await seedEvent()
    const guest = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", phone: PHONE, language: [] },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    const group = await seedGroup()

    const profileRes = await saveCheckinMatchingProfile(
      event.id,
      { guestId: guest.id },
      { workCity: "Pasig", scheduleDayOfWeek: 4, scheduleTimeStart: "19:00" }
    )
    expect(profileRes.success).toBe(true)

    const claimRes = await saveCheckinClaimedGroup(event.id, { guestId: guest.id }, group.id)
    expect(claimRes.success).toBe(true)

    const saved = await db.guest.findUnique({ where: { id: guest.id } })
    expect(saved?.workCity).toBe("Pasig")
    expect(saved?.scheduleDayOfWeek).toBe(4)
    expect(saved?.claimedSmallGroupId).toBe(group.id)
  })

  it("accepts a volunteer who has no registrant row", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const committee = await db.volunteerCommittee.create({
      data: { name: "Logistics", eventId: event.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
    })
    await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })

    const res = await saveCheckinMatchingProfile(
      event.id,
      { memberId: member.id },
      { workCity: "Pasig" }
    )
    expect(res.success).toBe(true)
  })

  it("refuses someone who is not attending the event", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const other = await db.guest.create({
      data: { firstName: "Not", lastName: "Here", language: [] },
    })

    // No registrant row, no volunteer row — the event is the only thing scoping
    // these public writes, so an arbitrary id must be rejected.
    expect((await saveCheckinMatchingProfile(event.id, { memberId: member.id }, { workCity: "X" })).success).toBe(false)
    expect((await recordSmallGroupInterestAtCheckin(event.id, { guestId: other.id })).success).toBe(false)
    expect((await saveCheckinClaimedGroup(event.id, { guestId: other.id }, "whatever")).success).toBe(false)

    const saved = await db.member.findUnique({ where: { id: member.id } })
    expect(saved?.workCity).toBeNull()
  })
})
