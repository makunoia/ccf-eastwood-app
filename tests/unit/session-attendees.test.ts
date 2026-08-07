import { describe, expect, it } from "vitest"

import {
  buildSessionAttendeeStats,
  getBreakoutAssignmentLabel,
  isAttendeeStatusEditable,
  resolveStatusSelection,
  sortSessionAttendees,
  sortBreakoutStats,
} from "@/lib/session-attendees"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"

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

describe("resolveStatusSelection — what a status menu pick writes", () => {
  it("pins Returning on a guest the data reads as New", () => {
    expect(resolveStatusSelection("returning", false)).toEqual({
      isReturner: true,
      override: true,
    })
  })

  it("pins New on a guest the data reads as Returning", () => {
    expect(resolveStatusSelection("new", true)).toEqual({ isReturner: false, override: false })
  })

  // The misclick this whole menu exists for: someone marks a first-timer Returning by
  // accident, then picks New again. That must clear the override, not pin the opposite —
  // otherwise the row stops tracking their real attendance history from then on.
  it("clears the override when the pick matches the derived value", () => {
    expect(resolveStatusSelection("new", false)).toEqual({ isReturner: false, override: null })
    expect(resolveStatusSelection("returning", true)).toEqual({
      isReturner: true,
      override: null,
    })
  })

  // A pin can go stale: an admin marks a guest Returning, and later an earlier session is
  // imported so the derivation agrees on its own. Re-picking Returning then drops the now
  // redundant override rather than leaving it to shadow future history.
  it("drops an override that the derived value has caught up with", () => {
    expect(resolveStatusSelection("returning", true).override).toBeNull()
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

// ─── sortBreakoutStats (CCF-141) ──────────────────────────────────────────────

describe("sortBreakoutStats", () => {
  const row = (name: string, memberCount: number, memberLimit: number | null) => ({
    name,
    occupancy: breakoutOccupancy({ memberCount, memberLimit }),
  })

  it("keeps alphabetical order by default, so the tab reads as it always has", () => {
    const rows = [row("Charlie", 0, 12), row("Alpha", 8, 12), row("Bravo", 2, 12)]
    expect(sortBreakoutStats(rows, "name").map((r) => r.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ])
  })

  it("puts the group with the most room first when asked", () => {
    const rows = [row("Alpha", 8, 12), row("Bravo", 2, 12), row("Charlie", 11, 12)]
    expect(sortBreakoutStats(rows, "room").map((r) => r.name)).toEqual([
      "Bravo",
      "Alpha",
      "Charlie",
    ])
  })

  it("ranks an uncapped group above every capped one", () => {
    const rows = [row("Alpha", 0, 12), row("Open", 30, null)]
    expect(sortBreakoutStats(rows, "room")[0].name).toBe("Open")
  })

  it("sinks a full group to the bottom", () => {
    const rows = [row("Full", 8, 8), row("Roomy", 1, 8)]
    expect(sortBreakoutStats(rows, "room").map((r) => r.name)).toEqual(["Roomy", "Full"])
  })

  it("breaks ties by name so the list never reshuffles between renders", () => {
    const rows = [row("Bravo", 4, 12), row("Alpha", 4, 12)]
    expect(sortBreakoutStats(rows, "room").map((r) => r.name)).toEqual(["Alpha", "Bravo"])
  })

  it("does not mutate the array it was given", () => {
    const rows = [row("Bravo", 8, 12), row("Alpha", 1, 12)]
    sortBreakoutStats(rows, "room")
    expect(rows.map((r) => r.name)).toEqual(["Bravo", "Alpha"])
  })
})
