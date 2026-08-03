import { describe, it, expect } from "vitest"
import {
  isEstablishedAttendee,
  isReturner,
  resolveAttendeeStatus,
} from "@/lib/session-stats"

// Covers the "members are never New" rule on the occurrence detail page.
// `isEstablishedAttendee` returns true when an attendee should NOT be tagged "New".
// Page semantics: stat field is `isReturner` (true = established/returning, false = New).

const OCC = "occ-current"
const TODAY = new Date("2026-06-04T00:00:00Z")

// A prior attendance at a different occurrence on an earlier date → makes a guest a returner.
const priorAttendance = [
  { occurrenceId: "occ-prev", occurrence: { date: new Date("2026-05-28T00:00:00Z") } },
]

describe("isEstablishedAttendee — members are never tagged New", () => {
  describe("members", () => {
    it("treats a member with NO prior attendance as established (not New)", () => {
      // First-time check-in, but they are a Member → established.
      expect(isEstablishedAttendee(true, [], OCC, TODAY)).toBe(true)
    })

    it("treats a member with prior attendance as established", () => {
      expect(isEstablishedAttendee(true, priorAttendance, OCC, TODAY)).toBe(true)
    })

    it("treats a member as established even if their only attendance is the current occurrence", () => {
      const onlyCurrent = [{ occurrenceId: OCC, occurrence: { date: TODAY } }]
      expect(isEstablishedAttendee(true, onlyCurrent, OCC, TODAY)).toBe(true)
    })
  })

  describe("guests (non-members) fall back to attendance history", () => {
    it("tags a first-time guest as New (not established)", () => {
      expect(isEstablishedAttendee(false, [], OCC, TODAY)).toBe(false)
    })

    it("treats a returning guest (prior occurrence) as established", () => {
      expect(isEstablishedAttendee(false, priorAttendance, OCC, TODAY)).toBe(true)
    })

    it("does not count the current occurrence as prior attendance → still New", () => {
      const onlyCurrent = [{ occurrenceId: OCC, occurrence: { date: TODAY } }]
      expect(isEstablishedAttendee(false, onlyCurrent, OCC, TODAY)).toBe(false)
    })

    it("does not count same-day future occurrences as prior attendance → still New", () => {
      const sameDayOther = [
        { occurrenceId: "occ-other", occurrence: { date: TODAY } },
      ]
      expect(isEstablishedAttendee(false, sameDayOther, OCC, TODAY)).toBe(false)
    })
  })

  describe("consistency with isReturner for non-members", () => {
    it("matches isReturner exactly when isMember is false", () => {
      const cases = [[], priorAttendance]
      for (const att of cases) {
        expect(isEstablishedAttendee(false, att, OCC, TODAY)).toBe(
          isReturner(att, OCC, TODAY),
        )
      }
    })
  })
})

// The admin can pin the badge on the attendance row itself — a guest who attended
// before the church started recording sessions would otherwise read "New" forever.
describe("resolveAttendeeStatus — admin override on the attendance row", () => {
  it("falls back to the derived value when there is no override", () => {
    expect(resolveAttendeeStatus(null, false, [], OCC, TODAY)).toBe(false)
    expect(resolveAttendeeStatus(null, false, priorAttendance, OCC, TODAY)).toBe(true)
    expect(resolveAttendeeStatus(null, true, [], OCC, TODAY)).toBe(true)
  })

  it("treats undefined (field not selected / no row) the same as null", () => {
    expect(resolveAttendeeStatus(undefined, false, [], OCC, TODAY)).toBe(false)
    expect(resolveAttendeeStatus(undefined, false, priorAttendance, OCC, TODAY)).toBe(true)
  })

  it("promotes a first-time guest to Returning when overridden to true", () => {
    expect(resolveAttendeeStatus(true, false, [], OCC, TODAY)).toBe(true)
  })

  it("demotes a returning guest to New when overridden to false", () => {
    expect(resolveAttendeeStatus(false, false, priorAttendance, OCC, TODAY)).toBe(false)
  })

  it("lets an override win over the member rule", () => {
    // Members derive as established; an explicit false still pins them to New.
    expect(resolveAttendeeStatus(false, true, [], OCC, TODAY)).toBe(false)
  })
})
