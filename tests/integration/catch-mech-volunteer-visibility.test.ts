import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import type { VolunteerEntry } from "@/app/events/[id]/catch-mech/volunteers/actions"
import {
  submitCatchMechVolunteerPlacements,
  verifyCatchMechVolunteer,
} from "@/app/events/[id]/catch-mech/volunteers/actions"
import { getVolunteerFollowUpData } from "@/app/(event)/event/[id]/catch-mech/volunteers/data"
import { getVolunteerPlacementRequestIds } from "@/lib/catch-mech/volunteer-requests"

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


/**
 * A non-facilitator volunteer's placements land on a request row with a null
 * breakoutGroupId, which every breakout-scoped Catch Mech screen filters out.
 * These pin the seam that makes them visible again.
 */
async function seed() {
  const event = await db.event.create({
    data: {
      name: "Volunteer Visibility",
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
    data: { name: "Usher", committeeId: committee.id },
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

async function tokenFor(eventId: string) {
  const verified = await verifyCatchMechVolunteer(eventId, "09171234567")
  if (!verified.success) throw new Error(verified.error)
  return tokenOf(verified.data)
}

describe("Catch Mech volunteer placement visibility", () => {
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

  it("attributes a volunteer's placement so the breakout-scoped lists can find it", async () => {
    const { event, group } = await seed()
    const guest = await db.guest.create({
      data: { firstName: "Mia", lastName: "Guest", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const result = await submitCatchMechVolunteerPlacements(
      await tokenFor(event.id),
      [{ registrantId: registrant.id, smallGroupId: group.id }]
    )
    expect(result.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirstOrThrow()
    // The row the breakout-scoped screens miss, and why they miss it.
    expect(request.status).toBe("Confirmed")
    expect(request.breakoutGroupId).toBeNull()

    const attributed = await getVolunteerPlacementRequestIds(event.id)
    expect([...attributed]).toEqual([request.id])
  })

  it("does not claim a groupless request the volunteer never made", async () => {
    const { event, group } = await seed()
    const other = await db.smallGroup.create({
      data: {
        name: "Other Group",
        language: [],
        leader: {
          create: {
            firstName: "Bea",
            lastName: "Other",
            dateJoined: new Date(),
            language: [],
          },
        },
      },
    })
    const member = await db.member.create({
      data: { firstName: "Ken", lastName: "Seeker", dateJoined: new Date(), language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    // Same person, different destination, raised by another path entirely.
    const seeker = await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, smallGroupId: other.id, status: "Pending" },
    })

    const result = await submitCatchMechVolunteerPlacements(
      await tokenFor(event.id),
      [{ registrantId: registrant.id, smallGroupId: group.id }]
    )
    expect(result.success).toBe(true)

    const attributed = await getVolunteerPlacementRequestIds(event.id)
    expect(attributed.has(seeker.id)).toBe(false)
    const placed = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: member.id, smallGroupId: group.id },
    })
    expect([...attributed]).toEqual([placed.id])
  })

  it("keeps an existing breakout link when a volunteer confirms the same person", async () => {
    const { event, group } = await seed()
    const breakout = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Table 1", linkedSmallGroupId: group.id, language: [] },
    })
    const member = await db.member.create({
      data: { firstName: "Rio", lastName: "Table", dateJoined: new Date(), language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    const pending = await db.smallGroupMemberRequest.create({
      data: {
        memberId: member.id,
        smallGroupId: group.id,
        breakoutGroupId: breakout.id,
        status: "Pending",
      },
    })

    const result = await submitCatchMechVolunteerPlacements(
      await tokenFor(event.id),
      [{ registrantId: registrant.id, smallGroupId: group.id }]
    )
    expect(result.success).toBe(true)

    // Regression: the volunteer flow passes a null breakoutGroupId, which used to
    // overwrite the link and drop this person out of the breakout's own counts.
    const resolved = await db.smallGroupMemberRequest.findUniqueOrThrow({
      where: { id: pending.id },
    })
    expect(resolved.status).toBe("Confirmed")
    expect(resolved.breakoutGroupId).toBe(breakout.id)
  })

  it("still attributes a placement after an admin undoes it", async () => {
    const { event, group } = await seed()
    const member = await db.member.create({
      data: { firstName: "Lia", lastName: "Undone", dateJoined: new Date(), language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    const result = await submitCatchMechVolunteerPlacements(
      await tokenFor(event.id),
      [{ registrantId: registrant.id, smallGroupId: group.id }]
    )
    expect(result.success).toBe(true)
    const request = await db.smallGroupMemberRequest.findFirstOrThrow()

    // What the admin Undo button does: back to Pending, breakoutGroupId still null.
    await db.smallGroupMemberRequest.update({
      where: { id: request.id },
      data: { status: "Pending", resolvedAt: null },
    })
    await db.member.update({
      where: { id: member.id },
      data: { smallGroupId: null, groupStatus: null },
    })

    // The submission's decisions are immutable, so the row stays attributable and
    // the Pending list can still reach it.
    const attributed = await getVolunteerPlacementRequestIds(event.id)
    expect(attributed.has(request.id)).toBe(true)
  })

  it("keeps a submitted response listed after the volunteer stops being confirmed", async () => {
    const { event, group, volunteer } = await seed()
    const guest = await db.guest.create({
      data: { firstName: "Joy", lastName: "Guest", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    const result = await submitCatchMechVolunteerPlacements(
      await tokenFor(event.id),
      [{ registrantId: registrant.id, smallGroupId: group.id }]
    )
    expect(result.success).toBe(true)

    await db.volunteer.update({ where: { id: volunteer.id }, data: { status: "Pending" } })

    const data = await getVolunteerFollowUpData(event.id)
    expect(data?.submissions).toHaveLength(1)
    expect(data?.submissions[0].placedCount).toBe(1)
    expect(data?.submissions[0].committeeName).toBe("Welcoming")
    expect(data?.submissions[0].decisions.map((d) => d.name)).toEqual(["Joy Guest"])
    expect(data?.committees).toContain("Welcoming")
    // No longer confirmed, so no longer someone we are still waiting on.
    expect(data?.nonResponders).toHaveLength(0)
  })
})
