import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  searchCatchMechVolunteerParticipants,
  submitCatchMechVolunteerPlacements,
  verifyCatchMechVolunteer,
} from "@/app/events/[id]/catch-mech/volunteers/actions"

async function seed() {
  const event = await db.event.create({
    data: {
      name: "Volunteer Follow-up",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      modules: { create: { type: "CatchMech" } },
    },
  })
  const leader = await db.member.create({
    data: {
      firstName: "Ana",
      lastName: "Leader",
      phone: "+63 917 123 4567",
      dateJoined: new Date(),
      language: [],
    },
  })
  const group = await db.smallGroup.create({
    data: { name: "Ana's Group", leaderId: leader.id, language: [] },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Welcoming", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Volunteer", committeeId: committee.id },
  })
  const volunteer = await db.volunteer.create({
    data: {
      memberId: leader.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  return { event, leader, group, volunteer }
}

describe("Catch Mech volunteer follow-up", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "ConfirmationSubmission", "CatchMechVolunteerSession", "CatchMechSession",
        "EventRegistrant", "Guest", "SmallGroupMemberRequest", "SmallGroupLog",
        "Volunteer", "CommitteeRole", "VolunteerCommittee", "SmallGroup", "Member",
        "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("normalizes a confirmed volunteer's mobile number and reuses their session", async () => {
    const { event, volunteer } = await seed()

    const first = await verifyCatchMechVolunteer(event.id, "09171234567")
    const second = await verifyCatchMechVolunteer(event.id, "+63 917 123 4567")

    expect(first.success).toBe(true)
    expect(second).toEqual(first)
    expect(await db.catchMechVolunteerSession.count({ where: { volunteerId: volunteer.id } })).toBe(1)
  })

  it("immediately promotes a guest, places them, and writes the volunteer audit submission", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({
      data: { firstName: "Mia", lastName: "Guest", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    const verified = await verifyCatchMechVolunteer(event.id, "09171234567")
    if (!verified.success) throw new Error(verified.error)

    const result = await submitCatchMechVolunteerPlacements(verified.data.token, [{
      registrantId: registrant.id,
      smallGroupId: group.id,
    }])

    expect(result).toEqual({ success: true, data: { placedCount: 1 } })
    const promoted = await db.guest.findUnique({ where: { id: guest.id } })
    expect(promoted?.memberId).toBeTruthy()
    const member = await db.member.findUnique({ where: { id: promoted!.memberId! } })
    expect(member?.smallGroupId).toBe(group.id)
    expect(await db.smallGroupLog.count({
      where: { smallGroupId: group.id, action: "MemberAdded" },
    })).toBe(1)
    const submission = await db.confirmationSubmission.findFirst()
    expect(submission?.source).toBe("CatchMechVolunteer")
    expect(submission?.confirmedCount).toBe(1)
    expect(submission?.breakoutGroupId).toBeNull()
  })

  it("records a no-placement response and rejects an unconfirmed volunteer", async () => {
    const { event, volunteer } = await seed()
    const result = await verifyCatchMechVolunteer(event.id, "09171234567")
    if (!result.success) throw new Error(result.error)

    const submitted = await submitCatchMechVolunteerPlacements(result.data.token, [])
    expect(submitted).toEqual({ success: true, data: { placedCount: 0 } })
    expect(await db.confirmationSubmission.count({
      where: { source: "CatchMechVolunteer", confirmedCount: 0 },
    })).toBe(1)

    await db.volunteer.update({ where: { id: volunteer.id }, data: { status: "Pending" } })
    const rejected = await verifyCatchMechVolunteer(event.id, "09171234567")
    expect(rejected).toEqual({
      success: false,
      error: "You are not a confirmed volunteer for this event",
    })
  })

  describe("participant search", () => {
    async function seedSearchable() {
      const base = await seed()
      const verified = await verifyCatchMechVolunteer(base.event.id, "09171234567")
      if (!verified.success) throw new Error(verified.error)

      const guest = await db.guest.create({
        data: {
          firstName: "Maria",
          lastName: "Santos",
          nickname: "Mimi",
          phone: "+63 917 555 8888",
          language: [],
        },
      })
      const guestRegistrant = await db.eventRegistrant.create({
        data: { eventId: base.event.id, guestId: guest.id },
      })
      return { ...base, token: verified.data.token, guest, guestRegistrant }
    }

    it("finds an eligible guest by full name regardless of token order", async () => {
      const { token, guestRegistrant } = await seedSearchable()

      const forward = await searchCatchMechVolunteerParticipants(token, "Maria Santos")
      const reversed = await searchCatchMechVolunteerParticipants(token, "santos maria")

      expect(forward.success && forward.data).toEqual([
        {
          registrantId: guestRegistrant.id,
          name: "Maria Santos",
          nickname: "Mimi",
          kind: "Guest",
          // Masked, never the raw number — this page is public.
          contactHint: "+63 ••• ••• 8888",
        },
      ])
      expect(reversed).toEqual(forward)
    })

    it("ignores blank and single-character queries without hitting the DB", async () => {
      const { token } = await seedSearchable()

      expect(await searchCatchMechVolunteerParticipants(token, "")).toEqual({
        success: true,
        data: [],
      })
      expect(await searchCatchMechVolunteerParticipants(token, "M")).toEqual({
        success: true,
        data: [],
      })
    })

    it("excludes people who are already in a DGroup", async () => {
      const { token, event, group, guest } = await seedSearchable()

      // A member already placed in a DGroup.
      const placed = await db.member.create({
        data: {
          firstName: "Maria",
          lastName: "Cruz",
          dateJoined: new Date(),
          language: [],
          smallGroupId: group.id,
        },
      })
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: placed.id } })
      // A guest who has since been promoted to a member.
      const promotedMember = await db.member.create({
        data: { firstName: "Maria", lastName: "Reyes", dateJoined: new Date(), language: [] },
      })
      await db.guest.update({
        where: { id: guest.id },
        data: { memberId: promotedMember.id },
      })

      const result = await searchCatchMechVolunteerParticipants(token, "Maria")
      expect(result.success && result.data).toEqual([])
    })

    it("returns one entry per person even with duplicate registrant rows", async () => {
      const { token, event, guest, guestRegistrant } = await seedSearchable()
      await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

      const result = await searchCatchMechVolunteerParticipants(token, "Maria")
      expect(result.success && result.data.map((r) => r.registrantId)).toEqual([
        guestRegistrant.id,
      ])
    })

    it("refuses an unknown token, an unconfirmed volunteer, and a disabled module", async () => {
      const { token, event, volunteer } = await seedSearchable()
      const unavailable = {
        success: false,
        error: "This volunteer session is no longer available",
      }

      expect(await searchCatchMechVolunteerParticipants("not-a-token", "Maria")).toEqual(unavailable)

      await db.eventModule.deleteMany({ where: { eventId: event.id, type: "CatchMech" } })
      expect(await searchCatchMechVolunteerParticipants(token, "Maria")).toEqual(unavailable)

      await db.volunteer.update({ where: { id: volunteer.id }, data: { status: "Pending" } })
      expect(await searchCatchMechVolunteerParticipants(token, "Maria")).toEqual(unavailable)
    })
  })
})
