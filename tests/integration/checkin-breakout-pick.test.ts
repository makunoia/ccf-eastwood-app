import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"

/**
 * Picking a breakout group at check-in (CCF-149).
 *
 * The step exists for the person who arrives unseated on an event that doesn't
 * auto-assign: nobody was ever going to place them, and the kiosk is the last
 * moment anyone asks. These tests pin who gets offered it, what the ranking sees,
 * and — the part that matters most — that a public, session-less endpoint taking a
 * caller-supplied group id cannot be used to seat anyone anywhere.
 *
 * The session is mocked **signed out** by default, unlike the suite's usual
 * SuperAdmin. The check-in kiosk is a public route, so a stranger with the URL is
 * the case that matters; the two privileges that hang off a real session —
 * seeing headcounts and going over a table's limit — are asserted from both
 * sides, exactly as `breakout-occupancy-visibility` does for the door.
 */

const authMock = vi.hoisted(() => ({ session: null as unknown }))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => authMock.session),
}))

import {
  getCheckinBreakoutChoices,
  pickCheckinBreakout,
} from "@/app/(dashboard)/events/breakout-actions"

const SIGNED_OUT = null
const EVENT_STAFF = { user: { id: "u1", role: "SuperAdmin" } }

beforeEach(async () => {
  authMock.session = SIGNED_OUT
  await db.$executeRaw`TRUNCATE "OccurrenceSubFacilitator", "OccurrenceAttendee", "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "EventModule", "EventClusterEvent", "EventCluster", "Event", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

/** An event with the Breakout module on — without it nothing is ever written. */
async function seedEvent(opts: { withModule?: boolean } = {}) {
  const event = await db.event.create({
    data: {
      name: "Retreat",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      ...(opts.withModule === false
        ? {}
        : { modules: { create: { type: "Breakout" } } }),
    },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  return { event, committee, role }
}

/**
 * A facilitator who has arrived. Every candidate query runs with the gate on, so
 * without this every table is held back and there is nothing to assert about
 * ranking.
 */
async function seedCheckedInFacilitator(
  eventId: string,
  committeeId: string,
  roleId: string,
  name: string
) {
  const member = await db.member.create({
    data: { firstName: name, lastName: "Faci", dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: {
      memberId: member.id,
      eventId,
      committeeId,
      preferredRoleId: roleId,
      status: "Confirmed",
      // How a OneTime check-in of a facilitator is recorded — on the Volunteer
      // row, not on an EventRegistrant.
      attendedAt: new Date(),
    },
  })
  return { member, volunteer }
}

/** A guest who has checked in, which is the state the step is reached from. */
async function seedCheckedInGuest(
  eventId: string,
  name: string,
  profile: { gender?: "Male" | "Female"; birthYear?: number; lifeStageId?: string } = {}
) {
  const guest = await db.guest.create({
    data: { firstName: name, lastName: "Attendee", language: [], ...profile },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, guestId: guest.id, attendedAt: new Date() },
  })
  return { guest, registrant }
}

describe("getCheckinBreakoutChoices — who gets offered the step", () => {
  it("ranks the emptiest table first and suggests it", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(
      event.id,
      committee.id,
      role.id,
      "Ana"
    )
    const full = await db.breakoutGroup.create({
      data: {
        name: "Busy Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        memberLimit: 10,
      },
    })
    const empty = await db.breakoutGroup.create({
      data: {
        name: "Quiet Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        memberLimit: 10,
      },
    })
    // Six of ten seats taken on one, none on the other.
    for (let i = 0; i < 6; i++) {
      const { registrant } = await seedCheckedInGuest(event.id, `Filler${i}`)
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: full.id, registrantId: registrant.id },
      })
    }

    const { registrant } = await seedCheckedInGuest(event.id, "Nora")
    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)

    expect(result.success).toBe(true)
    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.suggested?.id).toBe(empty.id)
    expect(result.data.options.map((o) => o.id)).toEqual([empty.id, full.id])
    expect(result.data.seatedGroupName).toBeNull()
  })

  it("withholds occupancy counts from an unauthenticated kiosk, but still orders by them", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    await db.breakoutGroup.create({
      data: { name: "Table A", eventId: event.id, facilitatorId: volunteer.id },
    })
    await db.breakoutGroup.create({
      data: { name: "Table B", eventId: event.id, facilitatorId: volunteer.id },
    })

    const { registrant } = await seedCheckedInGuest(event.id, "Nora")
    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)

    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.options).toHaveLength(2)
    // A person at the kiosk has no business knowing how many are at each table,
    // and until it is stripped the counts sit in the action's payload.
    for (const option of result.data.options) {
      expect(option.occupancy).toBeNull()
      expect(option.occupancyView).toBeNull()
      // ...but `fillLevel` survives, which is what the ordering runs on.
      expect(typeof option.fillLevel).toBe("number")
    }
  })

  it("keeps the counts for a signed-in staffer running the kiosk", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    await db.breakoutGroup.create({
      data: {
        name: "Table A",
        eventId: event.id,
        facilitatorId: volunteer.id,
        memberLimit: 8,
      },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    authMock.session = EVENT_STAFF
    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)

    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.options[0].occupancy).toEqual({ memberCount: 0, memberLimit: 8 })
    expect(result.data.options[0].occupancyView?.remaining).toBe(8)
  })

  it("skips the step for someone already seated — even via another registrant row", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const group = await db.breakoutGroup.create({
      data: { name: "Table 7", eventId: event.id, facilitatorId: volunteer.id },
    })

    const guest = await db.guest.create({
      data: { firstName: "Duplo", lastName: "Signup", language: [] },
    })
    // One human, two registrant rows on the same event — a duplicate sign-up. The
    // seat is held by the first; a row-scoped check would read the second as
    // unplaced and offer to seat the same person a second time.
    const first = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
    })
    const second = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: first.id },
    })

    const result = await getCheckinBreakoutChoices(second.id, event.id, null)
    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.seatedGroupName).toBe("Table 7")
    expect(result.data.options).toHaveLength(0)
  })

  it("drops the step entirely for someone who runs a table", async () => {
    const { event, committee, role } = await seedEvent()
    const { member, volunteer } = await seedCheckedInFacilitator(
      event.id,
      committee.id,
      role.id,
      "Ana"
    )
    await db.breakoutGroup.create({
      data: { name: "Ana's Table", eventId: event.id, facilitatorId: volunteer.id },
    })
    // A facilitator who also holds a registrant row. They attend as staff.
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id, attendedAt: new Date() },
    })

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    expect(result).toEqual({ success: true, data: null })
  })

  it("drops the step when the event has no groups at all", async () => {
    const { event } = await seedEvent()
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    expect(result).toEqual({ success: true, data: null })
  })

  it("drops the step when every group is switched off", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    await db.breakoutGroup.create({
      data: {
        name: "Retired Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        isEnabled: false,
      },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    // An admin taking every group out of play is indistinguishable from having
    // none, which is what "off" means on a public route.
    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    expect(result).toEqual({ success: true, data: null })
  })

  it("explains an empty list when the team hasn't arrived yet", async () => {
    const { event, committee, role } = await seedEvent()
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Faci", dateJoined: new Date(), language: [] },
    })
    // Assigned but NOT checked in — the gate holds the table back.
    const volunteer = await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })
    await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    if (!result.success || !result.data) throw new Error("expected a notice")
    // Saying so beats dropping the step, which is what made an enabled Breakout
    // toggle look like it did nothing on the walk-in form.
    expect(result.data.notice).toBe("awaiting-facilitator")
    expect(result.data.options).toHaveLength(0)
    expect(result.data.hasCandidates).toBe(false)
  })

  it("refuses a registrant that belongs to a different event", async () => {
    const { event } = await seedEvent()
    const { event: other } = await seedEvent()
    const { registrant } = await seedCheckedInGuest(other.id, "Nora")

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    expect(result).toEqual({ success: false, error: "Registration not found" })
  })
})

describe("getCheckinBreakoutChoices — missing profile data never reads as a mismatch", () => {
  it("still lists gendered tables for someone whose gender we don't hold", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const mens = await db.breakoutGroup.create({
      data: {
        name: "Men's Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        genderFocus: "Male",
      },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    if (!result.success || !result.data) throw new Error("expected choices")
    // Gender excludes an unknown candidate from a *suggestion* — a men's table is
    // a hard boundary — but never from the dropdown.
    expect(result.data.suggested).toBeNull()
    expect(result.data.options.map((o) => o.id)).toContain(mens.id)
    expect(result.data.hasCandidates).toBe(true)
  })

  it("hides a table run for the other gender once gender is known", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    await db.breakoutGroup.create({
      data: {
        name: "Men's Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        genderFocus: "Male",
      },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora", { gender: "Female" })

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.options).toHaveLength(0)
    // Distinct from "nothing here": the screen says "no groups match your details"
    // rather than showing an empty dropdown.
    expect(result.data.hasCandidates).toBe(true)
  })
})

describe("pickCheckinBreakout — the write", () => {
  async function seedPickable(name = "Nora") {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const group = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, name)
    return { event, group, registrant, volunteer }
  }

  it("seats the person at the table they picked", async () => {
    const { event, group, registrant } = await seedPickable()

    const result = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(result).toEqual({ success: true, data: { name: "Table 1" } })

    const seats = await db.breakoutGroupMember.findMany({
      where: { registrantId: registrant.id },
    })
    expect(seats).toHaveLength(1)
    expect(seats[0].breakoutGroupId).toBe(group.id)
  })

  it("moves rather than duplicates when picked a second time", async () => {
    const { event, group, registrant, volunteer } = await seedPickable()
    const second = await db.breakoutGroup.create({
      data: { name: "Table 2", eventId: event.id, facilitatorId: volunteer.id },
    })

    await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    const result = await pickCheckinBreakout(registrant.id, event.id, null, second.id)
    expect(result).toEqual({ success: true, data: { name: "Table 2" } })

    const seats = await db.breakoutGroupMember.findMany({
      where: { registrantId: registrant.id },
    })
    expect(seats).toHaveLength(1)
    expect(seats[0].breakoutGroupId).toBe(second.id)
  })

  it("refuses a registrant who has not been checked in", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const group = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const guest = await db.guest.create({
      data: { firstName: "Absent", lastName: "Person", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    // The guard that stops a public, session-less endpoint from seating anyone
    // anywhere. On the real path it is free — the step runs after the check-in.
    const result = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(result).toEqual({ success: false, error: "Check in first, then pick a group" })
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("refuses a table belonging to another event", async () => {
    const { event, registrant } = await seedPickable()
    const { event: other, committee, role } = await seedEvent()
    const { volunteer: otherFaci } = await seedCheckedInFacilitator(
      other.id,
      committee.id,
      role.id,
      "Bea"
    )
    const foreign = await db.breakoutGroup.create({
      data: { name: "Someone Else's Table", eventId: other.id, facilitatorId: otherFaci.id },
    })

    const result = await pickCheckinBreakout(registrant.id, event.id, null, foreign.id)
    expect(result.success).toBe(false)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("refuses a table that has been switched off since the form rendered", async () => {
    const { event, group, registrant } = await seedPickable()
    await db.breakoutGroup.update({ where: { id: group.id }, data: { isEnabled: false } })

    const result = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(result.success).toBe(false)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("writes nothing when the event lacks the Breakout module", async () => {
    const { event, committee, role } = await seedEvent({ withModule: false })
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const group = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(result.success).toBe(false)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })

  it("refuses a full table on an unauthenticated kiosk", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    const group = await db.breakoutGroup.create({
      data: {
        name: "Table 1",
        eventId: event.id,
        facilitatorId: volunteer.id,
        memberLimit: 1,
      },
    })
    const { registrant: taken } = await seedCheckedInGuest(event.id, "First")
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: taken.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    // A self-serve arrival cannot push a table past its limit.
    const result = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(result.success).toBe(false)
    expect(
      await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })
    ).toBe(1)

    // A staffer running the kiosk may have a reason to go over — the same line
    // the door draws, and it hangs on the session rather than on the surface.
    authMock.session = EVENT_STAFF
    const staffed = await pickCheckinBreakout(registrant.id, event.id, null, group.id)
    expect(staffed).toEqual({ success: true, data: { name: "Table 1" } })
    expect(
      await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })
    ).toBe(2)
  })

  it("keeps someone in the group they were already in when a pick is refused", async () => {
    const { event, group, registrant, volunteer } = await seedPickable()
    await pickCheckinBreakout(registrant.id, event.id, null, group.id)

    const disabled = await db.breakoutGroup.create({
      data: {
        name: "Closed Table",
        eventId: event.id,
        facilitatorId: volunteer.id,
        isEnabled: false,
      },
    })
    const result = await pickCheckinBreakout(registrant.id, event.id, null, disabled.id)

    // A refused pick reports where they actually are, not what they asked for —
    // saying "no group" to someone sitting in one would be a lie.
    expect(result).toEqual({ success: true, data: { name: "Table 1" } })
    const seats = await db.breakoutGroupMember.findMany({
      where: { registrantId: registrant.id },
    })
    expect(seats).toHaveLength(1)
    expect(seats[0].breakoutGroupId).toBe(group.id)
  })
})

describe("on a Collab day the tables belong to the cluster", () => {
  /**
   * Two ministries co-running one session. The day owns its own tables and the
   * member events' standing ones are unused — which is the whole reason the kiosk
   * can offer a pick here at all, since a Collab day's tables start empty and
   * every arrival needs placing.
   */
  async function seedCollab() {
    const day = new Date("2026-03-14T00:00:00.000Z")
    const cluster = await db.eventCluster.create({
      data: { name: "Youth × Singles", date: day, kind: "Collab", checkInIsOpen: true },
      select: { id: true },
    })
    const { event, committee, role } = await seedEvent()
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order: 0 },
    })
    const { volunteer } = await seedCheckedInFacilitator(
      event.id,
      committee.id,
      role.id,
      "Ana"
    )
    return { cluster, event, volunteer }
  }

  it("offers the day's tables, not the member event's standing ones", async () => {
    const { cluster, event, volunteer } = await seedCollab()
    // The member event's own standing table — untouched and unused for the day.
    await db.breakoutGroup.create({
      data: { name: "Standing Table", eventId: event.id, facilitatorId: volunteer.id },
    })
    const dayTable = await db.breakoutGroup.create({
      data: { name: "Day Table", clusterId: cluster.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    if (!result.success || !result.data) throw new Error("expected choices")
    expect(result.data.options.map((o) => o.id)).toEqual([dayTable.id])
  })

  it("seats them at the day's table through their own member event", async () => {
    const { cluster, event, volunteer } = await seedCollab()
    const dayTable = await db.breakoutGroup.create({
      data: { name: "Day Table", clusterId: cluster.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await pickCheckinBreakout(registrant.id, event.id, null, dayTable.id)
    expect(result).toEqual({ success: true, data: { name: "Day Table" } })

    const seat = await db.breakoutGroupMember.findFirst({
      where: { registrantId: registrant.id },
    })
    expect(seat?.breakoutGroupId).toBe(dayTable.id)
  })

  it("still refuses a table from another day", async () => {
    const { event } = await seedCollab()
    const other = await db.eventCluster.create({
      data: { name: "Some Other Day", kind: "Collab" },
      select: { id: true },
    })
    const foreign = await db.breakoutGroup.create({
      data: { name: "Another Day's Table", clusterId: other.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    const result = await pickCheckinBreakout(registrant.id, event.id, null, foreign.id)
    expect(result.success).toBe(false)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })
})

describe("skipping the step writes nothing", () => {
  it("leaves no seat behind when no group is picked", async () => {
    const { event, committee, role } = await seedEvent()
    const { volunteer } = await seedCheckedInFacilitator(event.id, committee.id, role.id, "Ana")
    await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })
    const { registrant } = await seedCheckedInGuest(event.id, "Nora")

    // Reading the choices is the whole of what "skip" does on the server: the
    // client never calls the write.
    const result = await getCheckinBreakoutChoices(registrant.id, event.id, null)
    expect(result.success).toBe(true)
    expect(await db.breakoutGroupMember.count()).toBe(0)
  })
})
