import { describe, it, expect } from "vitest"
import {
  EMPTY_ACTIVITY,
  activityVector,
  dominantIndex,
  isEmptyActivity,
  type RecordActivity,
} from "@/lib/people/duplicate-activity"

function activity(overrides: Partial<RecordActivity> = {}): RecordActivity {
  return { ...EMPTY_ACTIVITY, createdAt: new Date("2026-01-01").toISOString(), ...overrides }
}

describe("activityVector", () => {
  it("folds group membership into a 0/1 signal", () => {
    expect(activityVector(activity({ groupName: "Victory YA" }))).toEqual([0, 0, 0, 0, 0, 1])
    expect(activityVector(activity())).toEqual([0, 0, 0, 0, 0, 0])
  })

  it("ignores dates and satellite — they describe a record, they don't measure it", () => {
    const a = activity({ satellite: "CCF Ortigas", lastActivityAt: new Date().toISOString() })
    expect(activityVector(a)).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe("isEmptyActivity", () => {
  it("is true when nothing is recorded", () => {
    expect(isEmptyActivity(activity())).toBe(true)
  })

  it("is false when only a group is set", () => {
    expect(isEmptyActivity(activity({ groupName: "Victory YA" }))).toBe(false)
  })

  it("is false for a single event registration", () => {
    expect(isEmptyActivity(activity({ events: 1 }))).toBe(false)
  })

  it("stays true for a record that has only dates", () => {
    expect(isEmptyActivity(activity({ lastActivityAt: new Date().toISOString() }))).toBe(true)
  })

  it("stays true for a satellite-only record — which the row has to allow for", () => {
    // `satellite` is deliberately outside the vector, so this is correct for the
    // keeper decision: naming another satellite doesn't measure use of the
    // profile. It does mean "empty" is not the same as "the row shows nothing",
    // and `ActivityChips` has to suppress its "No activity" chip here or the
    // line contradicts itself ("No activity · CCF Ortigas").
    expect(isEmptyActivity(activity({ satellite: "CCF Ortigas" }))).toBe(true)
  })
})

describe("dominantIndex", () => {
  it("returns the record that leads on every count", () => {
    const list = [
      activity({ events: 12, checkIns: 8, ledGroups: 2, groupName: "Victory YA" }),
      activity({ events: 1 }),
    ]
    expect(dominantIndex(list)).toBe(0)
  })

  it("returns null when the lead is split across metrics", () => {
    // More events, but the other record leads a group — genuinely ambiguous.
    const list = [activity({ events: 12 }), activity({ events: 3, ledGroups: 1 })]
    expect(dominantIndex(list)).toBeNull()
  })

  it("returns null on an exact tie", () => {
    const list = [activity({ events: 4, checkIns: 2 }), activity({ events: 4, checkIns: 2 })]
    expect(dominantIndex(list)).toBeNull()
  })

  it("returns null when every record is empty", () => {
    expect(dominantIndex([activity(), activity(), activity()])).toBeNull()
  })

  it("returns null for a single record — nothing to compare against", () => {
    expect(dominantIndex([activity({ events: 9 })])).toBeNull()
  })

  it("returns null for an empty list", () => {
    expect(dominantIndex([])).toBeNull()
  })

  it("picks the dominator out of three records", () => {
    const list = [
      activity({ events: 2 }),
      activity({ events: 5, checkIns: 3, familyLinks: 1 }),
      activity({ events: 1, checkIns: 1 }),
    ]
    expect(dominantIndex(list)).toBe(1)
  })

  it("returns null when one record ties the leader on everything it has", () => {
    // Record 1 beats record 0 on events but they tie elsewhere, while record 2
    // leads on volunteer roles — no record covers the whole field.
    const list = [
      activity({ events: 2 }),
      activity({ events: 5 }),
      activity({ events: 1, volunteerRoles: 1 }),
    ]
    expect(dominantIndex(list)).toBeNull()
  })

  it("lets a record dominate on a >= comparison with one strict win", () => {
    const list = [activity({ events: 3, checkIns: 2 }), activity({ events: 3, checkIns: 1 })]
    expect(dominantIndex(list)).toBe(0)
  })

  it("never labels an all-zero record as most active", () => {
    // Index 0 is >= index 1 on every metric (both all-zero), but "most activity"
    // over nothing is noise.
    expect(dominantIndex([activity(), activity()])).toBeNull()
  })
})
