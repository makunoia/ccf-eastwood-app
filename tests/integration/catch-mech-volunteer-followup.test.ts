import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import type { VolunteerEntry } from "@/app/events/[id]/catch-mech/volunteers/actions"
import {
  searchCatchMechVolunteerParticipants,
  submitCatchMechVolunteerPlacements,
  verifyCatchMechVolunteer,
} from "@/app/events/[id]/catch-mech/volunteers/actions"
import { getVolunteerFollowUpData } from "@/app/(event)/event/[id]/catch-mech/volunteers/data"

/**
 * Narrows the entry result to a branch that carries a session token. These tests
 * exercise plain volunteers, who never hit the facilitator-choice branch.
 */
function tokenOf(entry: VolunteerEntry): string {
  if (entry.kind === "facilitator-choice") {
    throw new Error("expected a session token, got a facilitator group choice")
  }
  return entry.token
}


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

    const result = await submitCatchMechVolunteerPlacements(tokenOf(verified.data), [{
      registrantId: registrant.id,
      smallGroupId: group.id,
    }])

    expect(result).toEqual({ success: true, data: { placedCount: 1, createdGroupId: null } })
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

    const submitted = await submitCatchMechVolunteerPlacements(tokenOf(result.data), [])
    expect(submitted).toEqual({ success: true, data: { placedCount: 0, createdGroupId: null } })
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

  /**
   * A volunteer who leads no DGroup yet is the Elevate/Movement case: absorbing
   * someone is the promotion, so the submission has to create the group rather
   * than turn them away.
   */
  describe("volunteer who leads no DGroup", () => {
    /** Same seed, minus the group — the volunteer is a Timothy, not a Leader. */
    async function seedGrouplessVolunteer() {
      const { event, leader, group, volunteer } = await seed()
      await db.smallGroup.delete({ where: { id: group.id } })
      await db.member.update({ where: { id: leader.id }, data: { groupStatus: "Timothy" } })
      const guest = await db.guest.create({
        data: { firstName: "Mia", lastName: "Guest", language: [] },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      const verified = await verifyCatchMechVolunteer(event.id, "09171234567")
      if (!verified.success) throw new Error(verified.error)
      return { event, leader, volunteer, guest, registrant, token: tokenOf(verified.data) }
    }

    it("creates the named DGroup, promotes the volunteer, and places everyone into it", async () => {
      const { leader, guest, registrant, token } = await seedGrouplessVolunteer()

      const result = await submitCatchMechVolunteerPlacements(
        token,
        [{ registrantId: registrant.id, smallGroupId: null }],
        "  Ana's New Group  "
      )

      expect(result.success).toBe(true)
      const created = await db.smallGroup.findFirst({ where: { leaderId: leader.id } })
      expect(created?.name).toBe("Ana's New Group")
      expect(result.success && result.data).toEqual({
        placedCount: 1,
        createdGroupId: created!.id,
      })

      // The volunteer is now a Leader, and the absorbed guest is a member of the
      // group that did not exist a moment ago.
      const promotedVolunteer = await db.member.findUnique({ where: { id: leader.id } })
      expect(promotedVolunteer?.groupStatus).toBe("Leader")
      const promotedGuest = await db.guest.findUnique({ where: { id: guest.id } })
      const newMember = await db.member.findUnique({ where: { id: promotedGuest!.memberId! } })
      expect(newMember?.smallGroupId).toBe(created!.id)

      expect(
        await db.smallGroupLog.count({
          where: { smallGroupId: created!.id, action: "GroupCreated" },
        })
      ).toBe(1)
      // The submission records which group it created, same as the faci path.
      const submission = await db.confirmationSubmission.findFirst()
      expect(submission?.createdGroupId).toBe(created!.id)
    })

    it("requires a name before it will create anything", async () => {
      const { leader, registrant, token } = await seedGrouplessVolunteer()

      const missing = await submitCatchMechVolunteerPlacements(token, [
        { registrantId: registrant.id, smallGroupId: null },
      ])
      expect(missing).toEqual({
        success: false,
        error: "Name the DGroup these participants are joining",
      })

      const blank = await submitCatchMechVolunteerPlacements(
        token,
        [{ registrantId: registrant.id, smallGroupId: null }],
        "   "
      )
      expect(blank.success).toBe(false)

      // Nothing partial survives a rejected submission.
      expect(await db.smallGroup.count({ where: { leaderId: leader.id } })).toBe(0)
      expect(await db.confirmationSubmission.count()).toBe(0)
    })

    it("still records an empty response without inventing a DGroup", async () => {
      const { leader, token } = await seedGrouplessVolunteer()

      const result = await submitCatchMechVolunteerPlacements(token, [], "Unused Name")

      expect(result).toEqual({ success: true, data: { placedCount: 0, createdGroupId: null } })
      expect(await db.smallGroup.count({ where: { leaderId: leader.id } })).toBe(0)
      expect(await db.confirmationSubmission.count()).toBe(1)
    })

    it("refuses a placement aimed at a group the volunteer does not lead", async () => {
      const { registrant, token } = await seedGrouplessVolunteer()
      const stranger = await db.member.create({
        data: { firstName: "Other", lastName: "Leader", dateJoined: new Date(), language: [] },
      })
      const foreign = await db.smallGroup.create({
        data: { name: "Someone Else's Group", leaderId: stranger.id, language: [] },
      })

      const result = await submitCatchMechVolunteerPlacements(
        token,
        [{ registrantId: registrant.id, smallGroupId: foreign.id }],
        "Ana's New Group"
      )

      expect(result).toEqual({
        success: false,
        error: "You can only place participants in a DGroup you lead",
      })
      expect(await db.confirmationSubmission.count()).toBe(0)
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
      return { ...base, token: tokenOf(verified.data), guest, guestRegistrant }
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

  /**
   * The admin page used to show only a per-volunteer count. These pin the trail
   * back to the individual people, which is the whole point of the follow-up.
   */
  describe("admin follow-up page data", () => {
    it("names the people a volunteer absorbed and where each one landed", async () => {
      const { event, group, volunteer } = await seed()
      const guest = await db.guest.create({
        data: { firstName: "Mia", lastName: "Guest", language: [] },
      })
      const guestRegistrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      const existing = await db.member.create({
        data: { firstName: "Noel", lastName: "Member", dateJoined: new Date(), language: [] },
      })
      const memberRegistrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: existing.id },
      })

      const verified = await verifyCatchMechVolunteer(event.id, "09171234567")
      if (!verified.success) throw new Error(verified.error)
      const submitted = await submitCatchMechVolunteerPlacements(tokenOf(verified.data), [
        { registrantId: guestRegistrant.id, smallGroupId: group.id },
        { registrantId: memberRegistrant.id, smallGroupId: group.id },
      ])
      expect(submitted.success).toBe(true)

      const data = await getVolunteerFollowUpData(event.id)
      expect(data).not.toBeNull()
      expect(data!.nonResponders).toEqual([])
      expect(data!.submissions).toHaveLength(1)

      const row = data!.submissions[0]
      expect(row.volunteerId).toBe(volunteer.id)
      expect(row.placedCount).toBe(2)

      const byId = new Map(row.decisions.map((decision) => [decision.registrantId, decision]))
      // The guest was promoted in the same transaction, so the row now resolves
      // through the new Member — that memberId is what links to their profile.
      const promotedGuest = await db.guest.findUnique({ where: { id: guest.id } })
      expect(byId.get(guestRegistrant.id)).toEqual({
        registrantId: guestRegistrant.id,
        name: "Mia Guest",
        memberId: promotedGuest!.memberId,
        status: "confirmed",
        declineReason: null,
        smallGroupId: group.id,
        smallGroupName: "Ana's Group",
      })
      expect(byId.get(memberRegistrant.id)).toEqual({
        registrantId: memberRegistrant.id,
        name: "Noel Member",
        memberId: existing.id,
        status: "confirmed",
        declineReason: null,
        smallGroupId: group.id,
        smallGroupName: "Ana's Group",
      })
    })

    it("splits one submission across the volunteer's DGroups", async () => {
      const { event, leader, group } = await seed()
      const second = await db.smallGroup.create({
        data: { name: "Ana's Second Group", leaderId: leader.id, language: [] },
      })
      const registrants = await Promise.all(
        ["Ana", "Bea"].map(async (firstName) => {
          const guest = await db.guest.create({
            data: { firstName, lastName: "Attendee", language: [] },
          })
          return db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
        })
      )

      const verified = await verifyCatchMechVolunteer(event.id, "09171234567")
      if (!verified.success) throw new Error(verified.error)
      await submitCatchMechVolunteerPlacements(tokenOf(verified.data), [
        { registrantId: registrants[0].id, smallGroupId: group.id },
        { registrantId: registrants[1].id, smallGroupId: second.id },
      ])

      const data = await getVolunteerFollowUpData(event.id)
      expect(
        data!.submissions[0].decisions.map((d) => [d.name, d.smallGroupName])
      ).toEqual([
        ["Ana Attendee", "Ana's Group"],
        ["Bea Attendee", "Ana's Second Group"],
      ])
    })

    it("reports a no-placement response with an empty roster, not a missing row", async () => {
      const { event } = await seed()
      const verified = await verifyCatchMechVolunteer(event.id, "09171234567")
      if (!verified.success) throw new Error(verified.error)
      await submitCatchMechVolunteerPlacements(tokenOf(verified.data), [])

      const data = await getVolunteerFollowUpData(event.id)
      expect(data!.submissions).toHaveLength(1)
      expect(data!.submissions[0].placedCount).toBe(0)
      expect(data!.submissions[0].decisions).toEqual([])
    })

    it("lists a volunteer who has not answered and hides the page when the module is off", async () => {
      const { event, volunteer } = await seed()

      const data = await getVolunteerFollowUpData(event.id)
      expect(data!.submissions).toEqual([])
      expect(data!.nonResponders.map((entry) => entry.id)).toEqual([volunteer.id])
      expect(data!.committees).toEqual(["Welcoming"])

      await db.eventModule.deleteMany({ where: { eventId: event.id, type: "CatchMech" } })
      expect(await getVolunteerFollowUpData(event.id)).toBeNull()
    })
  })
})
