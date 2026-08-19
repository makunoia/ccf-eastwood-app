import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { verifyCatchMechFaci } from "@/app/events/[id]/catch-mech/actions"

/**
 * A substitute who actually ran the table must be able to answer for it. Before
 * this, only the assigned lead and co-faci could verify, so a table run by a
 * stand-in had nobody who could resolve its people.
 */
async function seed() {
  const event = await db.event.create({
    data: {
      name: "Sub Faci",
      type: "Recurring",
      startDate: new Date(),
      endDate: new Date(),
      modules: { create: { type: "CatchMech" } },
    },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const makeVolunteer = async (firstName: string, phone: string) => {
    const member = await db.member.create({
      data: { firstName, lastName: "Faci", phone, dateJoined: new Date(), language: [] },
    })
    const volunteer = await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })
    return { member, volunteer }
  }
  const lead = await makeVolunteer("Lead", "+63 917 111 1111")
  const sub = await makeVolunteer("Sub", "+63 917 222 2222")
  const stranger = await makeVolunteer("Stranger", "+63 917 333 3333")

  const breakout = await db.breakoutGroup.create({
    data: {
      eventId: event.id,
      name: "Table 1",
      facilitatorId: lead.volunteer.id,
      language: [],
    },
  })
  const occurrence = await db.eventOccurrence.create({
    data: { eventId: event.id, date: new Date() },
  })
  await db.occurrenceSubFacilitator.create({
    data: {
      occurrenceId: occurrence.id,
      breakoutGroupId: breakout.id,
      role: "Facilitator",
      substituteId: sub.volunteer.id,
    },
  })

  return { event, breakout, lead, sub, stranger }
}

describe("Catch Mech sub-facilitator access", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "CatchMechSession", "OccurrenceSubFacilitator", "EventOccurrence",
        "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "Guest",
        "SmallGroupMemberRequest", "SmallGroupLog", "Volunteer", "CommitteeRole",
        "VolunteerCommittee", "SmallGroup", "Member", "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("lets a substitute verify into a session for the table they covered", async () => {
    const { event, breakout, sub } = await seed()

    const result = await verifyCatchMechFaci(event.id, breakout.id, "09172222222")

    expect(result.success).toBe(true)
    const session = await db.catchMechSession.findFirstOrThrow()
    expect(session.facilitatorVolunteerId).toBe(sub.volunteer.id)
    expect(session.breakoutGroupId).toBe(breakout.id)
  })

  it("still refuses a volunteer with no claim on the table", async () => {
    const { event, breakout } = await seed()

    const result = await verifyCatchMechFaci(event.id, breakout.id, "09173333333")

    expect(result).toEqual({
      success: false,
      error: "You are not registered as a facilitator for this group",
    })
    expect(await db.catchMechSession.count()).toBe(0)
  })

  it("keeps the lead facilitator working unchanged", async () => {
    const { event, breakout, lead } = await seed()

    const result = await verifyCatchMechFaci(event.id, breakout.id, "09171111111")

    expect(result.success).toBe(true)
    const session = await db.catchMechSession.findFirstOrThrow()
    expect(session.facilitatorVolunteerId).toBe(lead.volunteer.id)
  })
})
