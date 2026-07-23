import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  submitCatchMechVolunteerPlacements,
  verifyCatchMechVolunteer,
} from "@/app/events/[id]/catch-mech/volunteers/actions"

async function seed() {
  const event = await db.event.create({
    data: { name: "Volunteer Follow-up", type: "OneTime", startDate: new Date(), endDate: new Date() },
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
})
