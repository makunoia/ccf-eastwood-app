import { describe, it, expect } from "vitest"
import {
  buildAttendanceBreakdown,
  shouldExplainMissingLifeStage,
  UNSPECIFIED_LIFE_STAGE_LABEL,
  type AttendanceParticipant,
} from "@/lib/events/attendance-breakdown"

/**
 * CCF-92 — attendance split into first-timers vs members, members in/out of a
 * DGroup, per Life Stage. Pure aggregation only; the DB loader is covered in
 * tests/integration/event-attendance-breakdown.test.ts.
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

describe("buildAttendanceBreakdown", () => {
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

describe("shouldExplainMissingLifeStage", () => {
  it("explains when nothing collects Life Stage and attendees are unspecified", () => {
    const breakdown = buildAttendanceBreakdown([participant({}), participant({ lifeStage: SINGLES })])
    expect(shouldExplainMissingLifeStage(breakdown, false)).toBe(true)
  })

  it("stays quiet when a form collects Life Stage", () => {
    // The unspecified bucket has other causes — a walk-in who skipped the field,
    // an older registrant. Only the "nobody was ever asked" case is explainable.
    const breakdown = buildAttendanceBreakdown([participant({})])
    expect(shouldExplainMissingLifeStage(breakdown, true)).toBe(false)
  })

  it("stays quiet when every attendee already has a life stage", () => {
    // Life Stage comes off the person record, so known members report it even
    // with every form bare — nothing to explain.
    const breakdown = buildAttendanceBreakdown([
      participant({ isMember: true, lifeStage: SINGLES }),
      participant({ isMember: true, lifeStage: YOUNG_PRO }),
    ])
    expect(shouldExplainMissingLifeStage(breakdown, false)).toBe(false)
  })

  it("stays quiet when there is no attendance at all", () => {
    expect(shouldExplainMissingLifeStage(buildAttendanceBreakdown([]), false)).toBe(false)
  })
})
