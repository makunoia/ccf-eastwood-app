import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { verifyCatchMechVolunteer } from "@/app/events/[id]/catch-mech/volunteers/actions"
import { getVolunteerFollowUpData } from "@/app/(event)/event/[id]/catch-mech/volunteers/data"

/**
 * A facilitator answering the volunteer form is answering the wrong one: they
 * would report only the people they personally absorbed while their table's
 * roster went unanswered, and they would sit in both response denominators at
 * once. The volunteer entry now routes them to the facilitator form instead.
 */
async function seed() {
  const event = await db.event.create({
    data: {
      name: "Redirect",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      modules: { create: { type: "CatchMech" } },
    },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Welcoming", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Usher", committeeId: committee.id },
  })
  const makeVolunteer = async (firstName: string, phone: string) => {
    const member = await db.member.create({
      data: { firstName, lastName: "Server", phone, dateJoined: new Date(), language: [] },
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

  const faci = await makeVolunteer("Ana", "+63 917 111 1111")
  const plain = await makeVolunteer("Bea", "+63 917 222 2222")
  const multi = await makeVolunteer("Cy", "+63 917 333 3333")

  const table = await db.breakoutGroup.create({
    data: { eventId: event.id, name: "Table 1", facilitatorId: faci.volunteer.id, language: [] },
  })
  await db.breakoutGroup.create({
    data: { eventId: event.id, name: "Table A", facilitatorId: multi.volunteer.id, language: [] },
  })
  await db.breakoutGroup.create({
    data: { eventId: event.id, name: "Table B", coFacilitatorId: multi.volunteer.id, language: [] },
  })

  return { event, faci, plain, multi, table }
}

describe("Catch Mech volunteer entry routing", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "ConfirmationSubmission", "CatchMechVolunteerSession", "CatchMechSession",
        "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "Guest",
        "SmallGroupMemberRequest", "SmallGroupLog", "Volunteer", "CommitteeRole",
        "VolunteerCommittee", "SmallGroup", "Member", "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("routes a facilitator to their own table's form", async () => {
    const { event, faci, table } = await seed()

    const result = await verifyCatchMechVolunteer(event.id, "09171111111")

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.kind).toBe("facilitator")
    if (result.data.kind !== "facilitator") throw new Error("expected the facilitator branch")
    expect(result.data.groupName).toBe("Table 1")

    // The session is already minted, so the redirect is a single hop.
    const session = await db.catchMechSession.findFirstOrThrow({
      where: { token: result.data.token },
    })
    expect(session.breakoutGroupId).toBe(table.id)
    expect(session.facilitatorVolunteerId).toBe(faci.volunteer.id)
    // And no volunteer session was created for them.
    expect(await db.catchMechVolunteerSession.count()).toBe(0)
  })

  it("asks which table when someone staffs several", async () => {
    const { event } = await seed()

    const result = await verifyCatchMechVolunteer(event.id, "09173333333")

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    if (result.data.kind !== "facilitator-choice") throw new Error("expected a group choice")
    // Lead on one, co-faci on the other — both are theirs to answer for.
    expect(result.data.groups.map((g) => g.name)).toEqual(["Table A", "Table B"])
    expect(await db.catchMechSession.count()).toBe(0)
  })

  it("leaves a plain volunteer on the volunteer form", async () => {
    const { event, plain } = await seed()

    const result = await verifyCatchMechVolunteer(event.id, "09172222222")

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.kind).toBe("volunteer")
    const session = await db.catchMechVolunteerSession.findFirstOrThrow()
    expect(session.volunteerId).toBe(plain.volunteer.id)
  })

  it("stops chasing facilitators for a volunteer response", async () => {
    const { event, plain } = await seed()

    const data = await getVolunteerFollowUpData(event.id)

    // Only the volunteer who staffs no table is still owed a response; the three
    // facilitators answer the other form.
    expect(data?.nonResponders.map((v) => v.volunteerName)).toEqual(["Bea Server"])
    expect(data?.nonResponders[0].id).toBe(plain.volunteer.id)
  })
})
