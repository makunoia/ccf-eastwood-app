import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  addRegistrantsToBreakout,
  autoAssignBreakouts,
} from "@/app/(dashboard)/events/breakout-actions"
import { assignBreakoutForRegistrant } from "@/lib/events/registration-core"

/**
 * One person occupies one table.
 *
 * `BreakoutGroupMember` is keyed by `registrantId`, and one person can hold
 * several `EventRegistrant` rows on the same event through a duplicate sign-up.
 * The person-level guard existed but only ran under a Collab cluster, so on a
 * plain event both rows read as unseated: the same human landed at two tables and
 * two facilitators could confirm them into two different DGroups.
 */
async function seed() {
  const event = await db.event.create({
    data: {
      name: "One Seat",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      autoAssignBreakout: true,
      modules: { create: { type: "Breakout" } },
    },
  })
  const member = await db.member.create({
    data: {
      firstName: "Dee",
      lastName: "Dupe",
      phone: "+63 917 555 5555",
      dateJoined: new Date(),
      language: [],
      gender: "Female",
      birthYear: 1995,
    },
  })
  // The duplicate sign-up: one person, two registrant rows on ONE event.
  const first = await db.eventRegistrant.create({
    data: { eventId: event.id, memberId: member.id },
  })
  const second = await db.eventRegistrant.create({
    data: { eventId: event.id, memberId: member.id },
  })
  const tableOne = await db.breakoutGroup.create({
    data: { eventId: event.id, name: "Table 1", language: [] },
  })
  const tableTwo = await db.breakoutGroup.create({
    data: { eventId: event.id, name: "Table 2", language: [] },
  })
  return { event, member, first, second, tableOne, tableTwo }
}

const seatCount = (memberId: string) =>
  db.breakoutGroupMember.count({ where: { registrant: { memberId } } })

describe("one breakout seat per person", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "Guest",
        "SmallGroupMemberRequest", "SmallGroupLog", "Volunteer", "CommitteeRole",
        "VolunteerCommittee", "SmallGroup", "Member", "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("refuses a second seat for the same person on a plain event", async () => {
    const { event, member, first, second, tableOne, tableTwo } = await seed()

    const seatOne = await addRegistrantsToBreakout(tableOne.id, [first.id], {
      eventId: event.id,
    })
    expect(seatOne.success && seatOne.data.added).toBe(1)

    const seatTwo = await addRegistrantsToBreakout(tableTwo.id, [second.id], {
      eventId: event.id,
    })

    expect(seatTwo.success).toBe(true)
    if (!seatTwo.success) throw new Error(seatTwo.error)
    expect(seatTwo.data.added).toBe(0)
    expect(seatTwo.data.failed[0]?.reason).toBe("is already in a breakout group")
    expect(await seatCount(member.id)).toBe(1)
  })

  it("refuses two of one person's rows inside a single batch", async () => {
    const { event, member, first, second, tableOne } = await seed()

    const result = await addRegistrantsToBreakout(tableOne.id, [first.id, second.id], {
      eventId: event.id,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.added).toBe(1)
    expect(await seatCount(member.id)).toBe(1)
  })

  it("skips an already-seated person during auto-assign", async () => {
    const { event, member, first, tableOne } = await seed()
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: tableOne.id, registrantId: first.id },
    })

    const result = await autoAssignBreakouts({ eventId: event.id })

    expect(result.success).toBe(true)
    // The second row is a candidate by registrant id, but not by person.
    expect(await seatCount(member.id)).toBe(1)
  })

  it("moves the existing seat rather than adding one at registration", async () => {
    const { event, member, first, second, tableOne, tableTwo } = await seed()
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: tableOne.id, registrantId: first.id },
    })

    // The person registers again and picks a different table.
    const assigned = await assignBreakoutForRegistrant(
      second.id,
      event.id,
      tableTwo.id,
      { gender: "Female", birthYear: 1995 }
    )

    expect(assigned?.id).toBe(tableTwo.id)
    expect(await seatCount(member.id)).toBe(1)
    // The seat moved off the OTHER registrant row — deleting by this registrant's
    // composite key would have left the original seat in place.
    expect(
      await db.breakoutGroupMember.count({ where: { breakoutGroupId: tableOne.id } })
    ).toBe(0)
  })

  it("reports the existing placement when no table was picked", async () => {
    const { event, member, first, second, tableOne } = await seed()
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: tableOne.id, registrantId: first.id },
    })

    const assigned = await assignBreakoutForRegistrant(second.id, event.id, null, {
      gender: "Female",
      birthYear: 1995,
    })

    // Auto-assign never overrides a placement — and now sees the person's, not
    // just this row's.
    expect(assigned?.id).toBe(tableOne.id)
    expect(await seatCount(member.id)).toBe(1)
  })
})
