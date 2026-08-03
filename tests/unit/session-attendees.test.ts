import { describe, expect, it } from "vitest"

import {
  buildSessionAttendeeStats,
  getBreakoutAssignmentLabel,
  isAttendeeStatusEditable,
  sortSessionAttendees,
} from "@/lib/session-attendees"

describe("session attendees helpers", () => {
  it("labels attendees without a breakout assignment as Unassigned", () => {
    expect(
      getBreakoutAssignmentLabel({
        name: "Alex",
        isReturner: false,
        breakoutGroupNames: [],
      }),
    ).toBe("Unassigned")
  })

  it("sorts attendees with New first when status sorting is ascending", () => {
    const attendees = [
      { name: "Bea", isReturner: true, breakoutGroupNames: ["Zion"] },
      { name: "Alex", isReturner: false, breakoutGroupNames: ["Alpha"] },
      { name: "Cara", isReturner: false, breakoutGroupNames: [] },
    ]

    expect(sortSessionAttendees(attendees, "asc").map((attendee) => attendee.name)).toEqual([
      "Alex",
      "Cara",
      "Bea",
    ])
  })

  it("sorts attendees with Returning first when status sorting is descending", () => {
    const attendees = [
      { name: "Bea", isReturner: true, breakoutGroupNames: ["Zion"] },
      { name: "Alex", isReturner: false, breakoutGroupNames: ["Alpha"] },
      { name: "Cara", isReturner: true, breakoutGroupNames: ["Alpha"] },
    ]

    expect(sortSessionAttendees(attendees, "desc").map((attendee) => attendee.name)).toEqual([
      "Cara",
      "Bea",
      "Alex",
    ])
  })
})

describe("isAttendeeStatusEditable — who can have their New/Returning badge toggled", () => {
  const guest = {
    kind: "registrant" as const,
    isMember: false,
    isVolunteer: false,
    hasStatusOverride: false,
  }

  it("lets an admin toggle a guest", () => {
    expect(isAttendeeStatusEditable(guest)).toBe(true)
  })

  it("locks a member — members are established by definition", () => {
    expect(isAttendeeStatusEditable({ ...guest, isMember: true })).toBe(false)
  })

  it("locks a volunteer", () => {
    expect(isAttendeeStatusEditable({ ...guest, isVolunteer: true })).toBe(false)
  })

  it("locks a volunteer attendance row", () => {
    expect(
      isAttendeeStatusEditable({ ...guest, kind: "volunteer", isMember: true, isVolunteer: true }),
    ).toBe(false)
  })

  // Regression: promoting a guest to a Member repoints their EventRegistrant, so a row
  // pinned while they were still a guest would flip to "member" and lock — stranding a
  // wrong badge with no way to clear it. A pinned row must always stay clickable.
  it("keeps a pinned row editable after the guest is promoted to a Member", () => {
    expect(
      isAttendeeStatusEditable({ ...guest, isMember: true, hasStatusOverride: true }),
    ).toBe(true)
  })

  // …but not for volunteers: their status is forced established upstream, so the button
  // would be a dead control that never changes what is rendered.
  it("still locks a pinned row once the person is a volunteer", () => {
    expect(
      isAttendeeStatusEditable({ ...guest, isVolunteer: true, hasStatusOverride: true }),
    ).toBe(false)
  })
})

// The stat cards render from these numbers on the client so they track optimistic
// edits — a removed row or a flipped badge has to move them without a server round-trip.
describe("buildSessionAttendeeStats", () => {
  const roster = [
    { isReturner: false, isVolunteer: false, gender: "Male" as const },
    { isReturner: true, isVolunteer: false, gender: "Female" as const },
    { isReturner: false, isVolunteer: false, gender: null },
    { isReturner: true, isVolunteer: true, gender: "Male" as const },
  ]

  it("counts total, new, participants and volunteers", () => {
    expect(buildSessionAttendeeStats(roster)).toEqual({
      totalCount: 4,
      newCount: 2,
      participantCount: 3,
      volunteersPresent: 1,
      menCount: 2,
      womenCount: 1,
    })
  })

  it("excludes attendees with no recorded gender from the gender bar", () => {
    const { menCount, womenCount, totalCount } = buildSessionAttendeeStats(roster)
    expect(menCount + womenCount).toBeLessThan(totalCount)
  })

  it("drops a removed row out of every figure", () => {
    const afterRemoval = roster.filter((_, i) => i !== 0)
    expect(buildSessionAttendeeStats(afterRemoval)).toMatchObject({
      totalCount: 3,
      newCount: 1,
      participantCount: 2,
      menCount: 1,
    })
  })

  it("moves the New count when a badge is toggled to Returning", () => {
    const toggled = roster.map((a, i) => (i === 0 ? { ...a, isReturner: true } : a))
    expect(buildSessionAttendeeStats(toggled).newCount).toBe(1)
  })

  it("returns zeroes for an empty session", () => {
    expect(buildSessionAttendeeStats([])).toEqual({
      totalCount: 0,
      newCount: 0,
      participantCount: 0,
      volunteersPresent: 0,
      menCount: 0,
      womenCount: 0,
    })
  })
})
