import { describe, expect, it } from "vitest"

import {
  buildClusterCheckinPeople,
  clusterCheckinCellNote,
  recordableCells,
  skipReasonFor,
  type ClusterCheckinSubjectRow,
  type ClusterCheckinTarget,
} from "@/lib/clusters/checkin-person"

/**
 * The cluster kiosk's collapse step: matched rows scattered across a day's
 * events become one person carrying one cell per event.
 *
 * What these pin is the difference between the cluster kiosk and the per-event
 * one. The per-event kiosk dedupes rows down to a single subject and checks it
 * in. Here the duplicates are the point — the same person legitimately owns a
 * row on every event of the day — so the collapse has to keep them all, one per
 * event, while still resolving to a single identity.
 */

const TARGETS: ClusterCheckinTarget[] = [
  { eventId: "e1", eventName: "Sunday Service", status: "open", occurrenceId: "occ-1" },
  { eventId: "e2", eventName: "Youth Night", status: "open", occurrenceId: null },
  { eventId: "e3", eventName: "Kids Camp", status: "formClosed", occurrenceId: null },
]

function row(overrides: Partial<ClusterCheckinSubjectRow> = {}): ClusterCheckinSubjectRow {
  return {
    key: "member:m1",
    eventId: "e1",
    subject: { kind: "registrant", id: "r1" },
    alreadyCheckedIn: false,
    firstName: "Juan",
    lastName: "Dela Cruz",
    nickname: null,
    contactHint: "•••• 4567",
    isMember: true,
    ...overrides,
  }
}

describe("buildClusterCheckinPeople", () => {
  it("collapses rows across events into one person", () => {
    const people = buildClusterCheckinPeople(TARGETS, [
      row({ eventId: "e1", subject: { kind: "registrant", id: "r1" } }),
      row({ eventId: "e2", subject: { kind: "registrant", id: "r2" } }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].name).toBe("Juan Dela Cruz")
    expect(people[0].events.map((c) => c.subject?.id)).toEqual(["r1", "r2", undefined])
  })

  it("gives every person a cell for every event of the day", () => {
    // The "not registered" cell is what tells a staffer someone is missing from
    // an event they meant to join, and what points them at the walk-in door.
    const people = buildClusterCheckinPeople(TARGETS, [row({ eventId: "e2" })])

    expect(people[0].events).toHaveLength(3)
    expect(people[0].events[0]).toMatchObject({ eventId: "e1", subject: null })
    expect(people[0].events[1].subject).not.toBeNull()
  })

  it("keeps two different people apart", () => {
    const people = buildClusterCheckinPeople(TARGETS, [
      row({ key: "member:m1", firstName: "Juan", lastName: "Dela Cruz" }),
      row({ key: "guest:g1", firstName: "Ana", lastName: "Bautista", isMember: false }),
    ])

    expect(people.map((p) => p.name)).toEqual(["Ana Bautista", "Juan Dela Cruz"])
  })

  it("prefers the volunteer row over the registrant row for the same event", () => {
    // Serving is the canonical presence record — the same precedence the
    // per-event kiosk applies when someone is both.
    const people = buildClusterCheckinPeople(TARGETS, [
      row({ eventId: "e1", subject: { kind: "registrant", id: "r1" } }),
      row({ eventId: "e1", subject: { kind: "volunteer", id: "v1" } }),
    ])

    expect(people[0].events[0].subject).toEqual({ kind: "volunteer", id: "v1" })
  })

  it("prefers the already-checked-in row of a duplicate sign-up", () => {
    const people = buildClusterCheckinPeople(TARGETS, [
      row({ eventId: "e1", subject: { kind: "registrant", id: "r1" } }),
      row({
        eventId: "e1",
        subject: { kind: "registrant", id: "r2" },
        alreadyCheckedIn: true,
      }),
    ])

    expect(people[0].events[0]).toMatchObject({ subject: { id: "r2" }, alreadyCheckedIn: true })
  })

  it("keys anonymous registrants per identity, not per row", () => {
    const people = buildClusterCheckinPeople(TARGETS, [
      row({ key: "anon:juan dela cruz|+639171234567", eventId: "e1", isMember: false }),
      row({ key: "anon:juan dela cruz|+639171234567", eventId: "e2", isMember: false }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].isMember).toBe(false)
  })

  it("returns nobody when nothing matched", () => {
    expect(buildClusterCheckinPeople(TARGETS, [])).toEqual([])
  })

  it("survives a day with no events", () => {
    const people = buildClusterCheckinPeople([], [row()])
    expect(people[0].events).toEqual([])
  })
})

describe("recordableCells", () => {
  it("records only the open, registered, not-yet-checked-in cells", () => {
    const [person] = buildClusterCheckinPeople(TARGETS, [
      row({ eventId: "e1" }),
      row({ eventId: "e2", alreadyCheckedIn: true }),
      row({ eventId: "e3" }), // registered, but the event's own form is closed
    ])

    expect(recordableCells(person).map((c) => c.eventId)).toEqual(["e1"])
  })

  it("skips an event with no session for the day", () => {
    const [person] = buildClusterCheckinPeople(
      [{ eventId: "e9", eventName: "Weekly", status: "noSession", occurrenceId: null }],
      [row({ eventId: "e9" })]
    )

    expect(recordableCells(person)).toEqual([])
  })

  it("records nothing for a person registered for none of the day's events", () => {
    const [person] = buildClusterCheckinPeople(TARGETS, [row({ eventId: "e2" })])
    expect(recordableCells(person).map((c) => c.eventId)).toEqual(["e2"])

    const [absent] = buildClusterCheckinPeople(
      [TARGETS[2]],
      [row({ eventId: "e3", subject: { kind: "registrant", id: "r3" } })]
    )
    expect(recordableCells(absent)).toEqual([])
  })
})

describe("skipReasonFor", () => {
  it("reports why each cell was passed over", () => {
    const [person] = buildClusterCheckinPeople(TARGETS, [
      row({ eventId: "e2", alreadyCheckedIn: true }),
      row({ eventId: "e3" }),
    ])

    expect(person.events.map(skipReasonFor)).toEqual(["notRegistered", "already", "formClosed"])
  })

  it("reports null for a cell that will be recorded", () => {
    const [person] = buildClusterCheckinPeople(TARGETS, [row({ eventId: "e1" })])
    expect(skipReasonFor(person.events[0])).toBeNull()
  })
})

describe("clusterCheckinCellNote", () => {
  // Attendee-facing: nobody at the door needs to know which switch is off, only
  // that the event isn't taking check-ins.
  it("says the same thing for both closed states", () => {
    expect(clusterCheckinCellNote("formClosed")).toBe("Check-in closed")
    expect(clusterCheckinCellNote("sessionClosed")).toBe("Check-in closed")
  })

  it("covers every skip reason", () => {
    for (const reason of ["notRegistered", "already", "noSession", "formClosed"] as const) {
      expect(clusterCheckinCellNote(reason)).toBeTruthy()
    }
  })
})
