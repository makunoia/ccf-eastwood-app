import { describe, it, expect } from "vitest"
import {
  buildCheckinStats,
  type CheckinRegistrantInput,
  type CheckinVolunteerInput,
} from "@/lib/checkin-stats"

// Derivation for the OneTime admin Check-in screen. Source of truth is
// `attendedAt`; with a single date, "New" = first-time guest (non-member,
// non-volunteer). Members and volunteers are always "established" (Returning).

const AT = new Date("2026-06-20T02:00:00Z") // attendedAt timestamp

function registrant(
  over: Partial<CheckinRegistrantInput> & Pick<CheckinRegistrantInput, "id">,
): CheckinRegistrantInput {
  return {
    memberId: null,
    member: null,
    guest: null,
    firstName: null,
    lastName: null,
    attendedAt: AT,
    ...over,
  }
}

function volunteer(
  over: Partial<CheckinVolunteerInput> & Pick<CheckinVolunteerInput, "id">,
): CheckinVolunteerInput {
  return {
    memberId: null,
    member: { firstName: "Vol", lastName: "Unteer", gender: "Male" },
    attendedAt: AT,
    ...over,
  }
}

describe("buildCheckinStats", () => {
  it("counts an empty roster as all zeros", () => {
    const stats = buildCheckinStats([], [], new Set())
    expect(stats).toMatchObject({
      rows: [],
      totalCount: 0,
      newCount: 0,
      participantCount: 0,
      volunteersPresent: 0,
      menCount: 0,
      womenCount: 0,
    })
  })

  it("tags a guest registrant as New and a member registrant as established", () => {
    const stats = buildCheckinStats(
      [
        registrant({
          id: "g1",
          guest: { firstName: "Gail", lastName: "Guest", gender: "Female" },
        }),
        registrant({
          id: "m1",
          memberId: "mem-1",
          member: { firstName: "Mark", lastName: "Member", gender: "Male" },
        }),
      ],
      [],
      new Set(),
    )

    expect(stats.totalCount).toBe(2)
    expect(stats.newCount).toBe(1) // only the guest
    expect(stats.participantCount).toBe(2) // no volunteers
    expect(stats.volunteersPresent).toBe(0)
    expect(stats.menCount).toBe(1)
    expect(stats.womenCount).toBe(1)

    const guestRow = stats.rows.find((r) => r.subjectId === "g1")!
    expect(guestRow.isReturner).toBe(false)
    expect(guestRow.isMember).toBe(false)
    expect(guestRow.name).toBe("Gail Guest")
  })

  it("counts a standalone volunteer attendance as a volunteer, never New", () => {
    const stats = buildCheckinStats(
      [],
      [volunteer({ id: "v1", memberId: "mem-v", member: { firstName: "Vera", lastName: "V", gender: "Female" } })],
      new Set(["mem-v"]),
    )

    expect(stats.totalCount).toBe(1)
    expect(stats.volunteersPresent).toBe(1)
    expect(stats.participantCount).toBe(0)
    expect(stats.newCount).toBe(0)
    expect(stats.womenCount).toBe(1)
    expect(stats.rows[0].kind).toBe("volunteer")
    expect(stats.rows[0].isReturner).toBe(true)
  })

  it("counts a registrant who is also a volunteer as a volunteer, not a new guest", () => {
    // Registrant linked to a member who is in the event's volunteer set, but the
    // volunteer itself has no separate attendance row.
    const stats = buildCheckinStats(
      [
        registrant({
          id: "r1",
          memberId: "mem-x",
          member: { firstName: "Xavier", lastName: "X", gender: "Male" },
        }),
      ],
      [],
      new Set(["mem-x"]),
    )

    expect(stats.totalCount).toBe(1)
    expect(stats.volunteersPresent).toBe(1)
    expect(stats.newCount).toBe(0)
    expect(stats.participantCount).toBe(0)
    expect(stats.rows[0].isVolunteer).toBe(true)
  })

  it("dedupes a person checked in as both a volunteer and a registrant", () => {
    const stats = buildCheckinStats(
      [
        registrant({
          id: "r-dup",
          memberId: "mem-dup",
          member: { firstName: "Dana", lastName: "Dup", gender: "Female" },
        }),
      ],
      [
        volunteer({
          id: "v-dup",
          memberId: "mem-dup",
          member: { firstName: "Dana", lastName: "Dup", gender: "Female" },
        }),
      ],
      new Set(["mem-dup"]),
    )

    // Only the volunteer row survives — no double count.
    expect(stats.totalCount).toBe(1)
    expect(stats.volunteersPresent).toBe(1)
    expect(stats.rows[0].kind).toBe("volunteer")
  })

  it("handles a guest with null gender without inflating gender counts", () => {
    const stats = buildCheckinStats(
      [registrant({ id: "g-ng", guest: { firstName: "Nø", lastName: "Gender", gender: null } })],
      [],
      new Set(),
    )

    expect(stats.totalCount).toBe(1)
    expect(stats.newCount).toBe(1)
    expect(stats.menCount).toBe(0)
    expect(stats.womenCount).toBe(0)
  })

  it("orders New attendees before Returning ones", () => {
    const stats = buildCheckinStats(
      [
        registrant({
          id: "mem",
          memberId: "m",
          member: { firstName: "Aaron", lastName: "Member", gender: "Male" },
        }),
        registrant({
          id: "guest",
          guest: { firstName: "Zoe", lastName: "Guest", gender: "Female" },
        }),
      ],
      [],
      new Set(),
    )

    // Guest (New) sorts before member (Returning) despite alphabetical order.
    expect(stats.rows[0].subjectId).toBe("guest")
    expect(stats.rows[1].subjectId).toBe("mem")
  })
})
