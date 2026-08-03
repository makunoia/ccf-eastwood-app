import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  loadEventAttendanceBreakdown,
  UNSPECIFIED_LIFE_STAGE_LABEL,
} from "@/lib/events/attendance-breakdown"

/**
 * CCF-92 — the DB-backed half of the event attendance report: who attended,
 * resolved to first-timer / member / member-in-a-DGroup, per Life Stage.
 * Pure aggregation is covered in tests/unit/attendance-breakdown.test.ts.
 */

describe("loadEventAttendanceBreakdown", () => {
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "SmallGroup", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function seedLifeStages() {
    const singles = await db.lifeStage.create({ data: { name: "Singles", order: 1 } })
    const youngPro = await db.lifeStage.create({ data: { name: "Young Pro", order: 2 } })
    return { singles, youngPro }
  }

  it("counts OneTime attendance by life stage, member status, and DGroup placement", async () => {
    const { singles, youngPro } = await seedLifeStages()

    const leader = await db.member.create({
      data: { firstName: "Lea", lastName: "Der", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({ data: { name: "Alpha", leaderId: leader.id } })
    const groupedMember = await db.member.create({
      data: {
        firstName: "Grace",
        lastName: "Cruz",
        dateJoined: new Date(),
        language: [],
        lifeStageId: singles.id,
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const ungroupedMember = await db.member.create({
      data: {
        firstName: "Mark",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: [],
        lifeStageId: youngPro.id,
      },
    })
    const guest = await db.guest.create({
      data: { firstName: "Jen", lastName: "Santos", language: [], lifeStageId: singles.id },
    })

    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "OneTime",
        startDate: new Date("2026-07-01T00:00:00Z"),
        endDate: new Date("2026-07-01T00:00:00Z"),
      },
    })

    const attendedAt = new Date("2026-07-01T02:00:00Z")
    await db.eventRegistrant.createMany({
      data: [
        { eventId: event.id, memberId: groupedMember.id, attendedAt },
        { eventId: event.id, memberId: ungroupedMember.id, attendedAt },
        { eventId: event.id, guestId: guest.id, attendedAt },
        // Registered but never checked in — must not appear in the report.
        { eventId: event.id, firstName: "No", lastName: "Show" },
      ],
    })

    const { rows, total } = await loadEventAttendanceBreakdown(
      db,
      event.id,
      "OneTime",
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z")
    )

    expect(total.attendees).toBe(3)
    expect(total.firstTimers).toBe(1)
    expect(total.members).toBe(2)
    expect(total.membersInGroup).toBe(1)
    expect(total.membersNotInGroup).toBe(1)

    expect(rows.map((r) => r.lifeStageName)).toEqual(["Singles", "Young Pro"])
    expect(rows[0]).toMatchObject({ attendees: 2, firstTimers: 1, membersInGroup: 1 })
    expect(rows[1]).toMatchObject({ attendees: 1, members: 1, membersNotInGroup: 1 })
  })

  it("excludes OneTime attendance outside the selected period", async () => {
    const member = await db.member.create({
      data: { firstName: "Old", lastName: "Timer", dateJoined: new Date(), language: [] },
    })
    const event = await db.event.create({
      data: {
        name: "Old Event",
        type: "OneTime",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-01-01T00:00:00Z"),
      },
    })
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        memberId: member.id,
        attendedAt: new Date("2026-01-01T02:00:00Z"),
      },
    })

    const { total } = await loadEventAttendanceBreakdown(
      db,
      event.id,
      "OneTime",
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    )

    expect(total.attendees).toBe(0)
  })

  describe("all-time window (null periodStart)", () => {
    it("counts a standalone session dated before the event start", async () => {
      // "All time" passes no lower bound precisely because an event can carry a
      // session dated before Event.startDate — anchoring to the start would drop
      // attendees the dashboard claims to be counting.
      const event = await db.event.create({
        data: {
          name: "Series With A Prequel",
          type: "Recurring",
          startDate: new Date("2026-07-01T00:00:00Z"),
          endDate: new Date("2026-07-29T00:00:00Z"),
        },
      })
      const guest = await db.guest.create({
        data: { firstName: "Early", lastName: "Bird", language: [] },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      const standalone = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2026-06-10T00:00:00Z") },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: standalone.id, registrantId: registrant.id },
      })

      const allTime = await loadEventAttendanceBreakdown(
        db,
        event.id,
        "Recurring",
        null,
        new Date("2026-07-31T00:00:00Z")
      )
      expect(allTime.total.attendees).toBe(1)

      // The same read bounded to the event's own start drops that attendee —
      // which is the bug the null lower bound exists to avoid.
      const bounded = await loadEventAttendanceBreakdown(
        db,
        event.id,
        "Recurring",
        event.startDate,
        new Date("2026-07-31T00:00:00Z")
      )
      expect(bounded.total.attendees).toBe(0)
    })

    it("still excludes OneTime registrants who never checked in", async () => {
      // Without a lower bound the attendedAt filter is carrying the whole
      // "did they show up?" question on its own.
      const event = await db.event.create({
        data: {
          name: "No Lower Bound",
          type: "OneTime",
          startDate: new Date("2026-07-05T00:00:00Z"),
          endDate: new Date("2026-07-05T00:00:00Z"),
        },
      })
      await db.eventRegistrant.createMany({
        data: [
          {
            eventId: event.id,
            firstName: "Came",
            lastName: "Early",
            attendedAt: new Date("2026-06-01T02:00:00Z"),
          },
          { eventId: event.id, firstName: "Never", lastName: "Showed" },
        ],
      })

      const { total } = await loadEventAttendanceBreakdown(
        db,
        event.id,
        "OneTime",
        null,
        new Date("2026-07-31T00:00:00Z")
      )

      expect(total.attendees).toBe(1)
      expect(total.firstTimers).toBe(1)
    })
  })

  it("counts a Recurring attendee once across multiple occurrences", async () => {
    const { singles } = await seedLifeStages()
    const guest = await db.guest.create({
      data: { firstName: "Repeat", lastName: "Visitor", language: [], lifeStageId: singles.id },
    })
    const event = await db.event.create({
      data: {
        name: "Midweek",
        type: "Recurring",
        startDate: new Date("2026-07-01T00:00:00Z"),
        endDate: new Date("2026-07-29T00:00:00Z"),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    const first = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-08T00:00:00Z") },
    })
    const second = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-15T00:00:00Z") },
    })
    await db.occurrenceAttendee.createMany({
      data: [
        { occurrenceId: first.id, registrantId: registrant.id },
        { occurrenceId: second.id, registrantId: registrant.id },
      ],
    })

    const { rows, total } = await loadEventAttendanceBreakdown(
      db,
      event.id,
      "Recurring",
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    )

    expect(total.attendees).toBe(1)
    expect(total.firstTimers).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].lifeStageName).toBe("Singles")
  })

  it("treats a promoted guest as a member, using the member's life stage and DGroup", async () => {
    const { singles, youngPro } = await seedLifeStages()

    const leader = await db.member.create({
      data: { firstName: "Lea", lastName: "Der", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({ data: { name: "Beta", leaderId: leader.id } })
    const promoted = await db.member.create({
      data: {
        firstName: "Promoted",
        lastName: "Person",
        dateJoined: new Date(),
        language: [],
        lifeStageId: youngPro.id,
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Promoted",
        lastName: "Person",
        language: [],
        lifeStageId: singles.id,
        memberId: promoted.id,
      },
    })

    const event = await db.event.create({
      data: {
        name: "Retreat",
        type: "MultiDay",
        startDate: new Date("2026-07-10T00:00:00Z"),
        endDate: new Date("2026-07-12T00:00:00Z"),
      },
    })
    // The registrant still points at the Guest record — resolution must follow
    // the guest → member link rather than read the guest's stale life stage.
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-10T00:00:00Z") },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, registrantId: registrant.id },
    })

    const { rows, total } = await loadEventAttendanceBreakdown(
      db,
      event.id,
      "MultiDay",
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    )

    expect(total.members).toBe(1)
    expect(total.firstTimers).toBe(0)
    expect(total.membersInGroup).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].lifeStageName).toBe("Young Pro")
  })

  it("buckets an anonymous walk-in registrant under 'Not specified'", async () => {
    const event = await db.event.create({
      data: {
        name: "Walk-in Night",
        type: "OneTime",
        startDate: new Date("2026-07-05T00:00:00Z"),
        endDate: new Date("2026-07-05T00:00:00Z"),
      },
    })
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Walk",
        lastName: "In",
        attendedAt: new Date("2026-07-05T02:00:00Z"),
      },
    })

    const { rows, total } = await loadEventAttendanceBreakdown(
      db,
      event.id,
      "OneTime",
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    )

    expect(total.attendees).toBe(1)
    expect(total.firstTimers).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].lifeStageName).toBe(UNSPECIFIED_LIFE_STAGE_LABEL)
    expect(rows[0].lifeStageId).toBeNull()
  })

  describe("regression", () => {
    it("excludes volunteer check-ins from attendance counts", async () => {
      // OccurrenceAttendee rows with a null registrantId are volunteer check-ins;
      // every dashboard attendance figure counts participants only.
      const event = await db.event.create({
        data: {
          name: "Volunteer Night",
          type: "Recurring",
          startDate: new Date("2026-07-01T00:00:00Z"),
          endDate: new Date("2026-07-29T00:00:00Z"),
        },
      })
      const member = await db.member.create({
        data: { firstName: "Vol", lastName: "Unteer", dateJoined: new Date(), language: [] },
      })
      const committee = await db.volunteerCommittee.create({
        data: { name: "Logistics", eventId: event.id },
      })
      const role = await db.committeeRole.create({
        data: { name: "Usher", committeeId: committee.id },
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
      const occurrence = await db.eventOccurrence.create({
        data: { eventId: event.id, date: new Date("2026-07-08T00:00:00Z") },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occurrence.id, volunteerId: volunteer.id },
      })

      const { rows, total } = await loadEventAttendanceBreakdown(
        db,
        event.id,
        "Recurring",
        new Date("2026-07-01T00:00:00Z"),
        new Date("2026-07-31T00:00:00Z")
      )

      expect(total.attendees).toBe(0)
      expect(rows).toEqual([])
    })
  })
})
