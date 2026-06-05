import { describe, expect, it } from "vitest"

import {
  getBreakoutAssignmentLabel,
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
