import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  buildAttendanceBreakdown,
  loadEventAttendanceBreakdown,
  UNSPECIFIED_LIFE_STAGE_LABEL,
  type AttendanceParticipant,
} from "@/lib/events/attendance-breakdown"

/**
 * Ticket verification suite for CCF-92 — attendance report splitting attendees
 * into first-timers vs members, members in/out of a DGroup, per Life Stage.
 *
 * Run locally:  pnpm verify:ticket CCF-92
 */

let seq = 0
function participant(over: Partial<AttendanceParticipant> = {}): AttendanceParticipant {
  return {
    registrantId: `r${seq++}`,
    isMember: false,
    inSmallGroup: false,
    lifeStage: null,
    ...over,
  }
}

const SINGLES = { id: "ls-singles", name: "Singles", order: 1 }
const YOUNG_PRO = { id: "ls-young-pro", name: "Young Pro", order: 2 }

describe("CCF-92", () => {
  describe("unit — buildAttendanceBreakdown", () => {
    it("splits first-timers, members in a DGroup, and members without one", () => {
      const { total } = buildAttendanceBreakdown([
        participant({ lifeStage: SINGLES }),
        participant({ isMember: true, inSmallGroup: true, lifeStage: SINGLES }),
        participant({ isMember: true, inSmallGroup: false, lifeStage: SINGLES }),
      ])

      expect(total.attendees).toBe(3)
      expect(total.firstTimers).toBe(1)
      expect(total.members).toBe(2)
      expect(total.membersInGroup).toBe(1)
      expect(total.membersNotInGroup).toBe(1)
    })

    it("groups counts per life stage and orders rows by LifeStage.order", () => {
      const { rows } = buildAttendanceBreakdown([
        participant({ lifeStage: YOUNG_PRO }),
        participant({ isMember: true, inSmallGroup: true, lifeStage: YOUNG_PRO }),
        participant({ isMember: true, inSmallGroup: false, lifeStage: SINGLES }),
      ])

      expect(rows.map((r) => r.lifeStageName)).toEqual(["Singles", "Young Pro"])
      expect(rows[0]).toMatchObject({
        attendees: 1,
        firstTimers: 0,
        members: 1,
        membersInGroup: 0,
        membersNotInGroup: 1,
      })
      expect(rows[1]).toMatchObject({
        attendees: 2,
        firstTimers: 1,
        members: 1,
        membersInGroup: 1,
        membersNotInGroup: 0,
      })
    })

    it("row counts sum to the totals row", () => {
      const { rows, total } = buildAttendanceBreakdown([
        participant({ lifeStage: SINGLES }),
        participant({ lifeStage: YOUNG_PRO, isMember: true, inSmallGroup: true }),
        participant({}),
      ])

      expect(rows.reduce((sum, r) => sum + r.attendees, 0)).toBe(total.attendees)
      expect(total.firstTimers + total.members).toBe(total.attendees)
      expect(total.membersInGroup + total.membersNotInGroup).toBe(total.members)
    })

    describe("edge cases", () => {
      it("returns no rows and zeroed totals for no attendees", () => {
        const { rows, total } = buildAttendanceBreakdown([])
        expect(rows).toEqual([])
        expect(total.attendees).toBe(0)
        expect(total.members).toBe(0)
      })

      it("buckets attendees with no life stage last, under 'Not specified'", () => {
        const { rows } = buildAttendanceBreakdown([
          participant({}),
          participant({ lifeStage: YOUNG_PRO }),
          participant({ lifeStage: SINGLES }),
        ])

        expect(rows.map((r) => r.lifeStageName)).toEqual([
          "Singles",
          "Young Pro",
          UNSPECIFIED_LIFE_STAGE_LABEL,
        ])
        expect(rows[2].lifeStageId).toBeNull()
      })

      it("omits the 'Not specified' bucket when every attendee has a life stage", () => {
        const { rows } = buildAttendanceBreakdown([participant({ lifeStage: SINGLES })])
        expect(rows).toHaveLength(1)
        expect(rows[0].lifeStageName).toBe("Singles")
      })

      it("counts a registrant once even if passed multiple times", () => {
        const dupe = participant({ registrantId: "dupe", lifeStage: SINGLES })
        const { rows, total } = buildAttendanceBreakdown([dupe, dupe, dupe])
        expect(total.attendees).toBe(1)
        expect(rows[0].attendees).toBe(1)
      })

      it("never counts a first-timer as being in a DGroup", () => {
        // inSmallGroup is meaningless without a member record — the tally guards it.
        const { total } = buildAttendanceBreakdown([
          participant({ isMember: false, inSmallGroup: true }),
        ])
        expect(total.firstTimers).toBe(1)
        expect(total.membersInGroup).toBe(0)
      })
    })
  })

  describe("integration — loadEventAttendanceBreakdown", () => {
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
})
