import { describe, it, expect } from "vitest"
import { planClusterCheckinToggle } from "@/lib/clusters/checkin-toggle"
import type { ClusterCheckinShortcut } from "@/lib/clusters/checkin-shortcuts"

/**
 * The rules for what opening a cluster day's check-in writes, per member event.
 * Pure, so every branch is reachable without seeding a database.
 */

const CLUSTER_DATE = new Date("2026-08-19T00:00:00.000Z")

function shortcut(
  over: Partial<ClusterCheckinShortcut> & Pick<ClusterCheckinShortcut, "eventId">
): ClusterCheckinShortcut {
  return {
    eventName: "An event",
    eventType: "Recurring",
    href: null,
    sessionDate: null,
    status: "sessionClosed",
    manageHref: `/event/${over.eventId}/sessions`,
    ...over,
  }
}

describe("planClusterCheckinToggle", () => {
  it("routes a OneTime event to its FormConfig switch", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", eventType: "OneTime" }), occurrenceId: null }],
      true,
      CLUSTER_DATE
    )
    expect(ops).toEqual([{ kind: "formConfig", eventId: "e1", eventName: "An event" }])
  })

  // A OneTime event never has an occurrence, so the absence of one must not be
  // read as "no session" and send it down the create path.
  it("does not try to create a session for a OneTime event", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", eventType: "OneTime" }), occurrenceId: null }],
      true,
      CLUSTER_DATE
    )
    expect(ops[0].kind).toBe("formConfig")
  })

  it("routes a session event to the occurrence the day resolved", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1" }), occurrenceId: "o1" }],
      true,
      CLUSTER_DATE
    )
    expect(ops).toEqual([
      { kind: "occurrence", eventId: "e1", eventName: "An event", occurrenceId: "o1" },
    ])
  })

  it("creates the day's session when a session event has none", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", status: "noSession" }), occurrenceId: null }],
      true,
      CLUSTER_DATE
    )
    expect(ops).toEqual([
      {
        kind: "createSession",
        eventId: "e1",
        eventName: "An event",
        date: new Date("2026-08-19T00:00:00.000Z"),
      },
    ])
  })

  // The cluster's date can carry a time — it is normalized before it becomes an
  // occurrence date, because `@@unique([eventId, date])` keys on UTC midnight.
  it("normalizes the created session to UTC midnight", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", status: "noSession" }), occurrenceId: null }],
      true,
      new Date("2026-08-19T14:37:12.345Z")
    )
    expect(ops[0]).toMatchObject({
      kind: "createSession",
      date: new Date("2026-08-19T00:00:00.000Z"),
    })
  })

  it("skips a dateless cluster rather than guessing a session date", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", status: "noSession" }), occurrenceId: null }],
      true,
      null
    )
    expect(ops).toEqual([
      { kind: "skip", eventId: "e1", eventName: "An event", reason: "noDate" },
    ])
  })

  // Shutting a day down has no business adding sessions to a member event's
  // calendar — there would be nothing to close.
  it("never creates a session while closing", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1", status: "noSession" }), occurrenceId: null }],
      false,
      CLUSTER_DATE
    )
    expect(ops).toEqual([
      { kind: "skip", eventId: "e1", eventName: "An event", reason: "noSession" },
    ])
  })

  it("closes an existing session the same way it opens one", () => {
    const ops = planClusterCheckinToggle(
      [{ shortcut: shortcut({ eventId: "e1" }), occurrenceId: "o1" }],
      false,
      CLUSTER_DATE
    )
    expect(ops[0]).toMatchObject({ kind: "occurrence", occurrenceId: "o1" })
  })

  it("plans every member event, in cluster order", () => {
    const ops = planClusterCheckinToggle(
      [
        { shortcut: shortcut({ eventId: "one", eventType: "OneTime" }), occurrenceId: null },
        { shortcut: shortcut({ eventId: "two" }), occurrenceId: "o2" },
        { shortcut: shortcut({ eventId: "three", status: "noSession" }), occurrenceId: null },
      ],
      true,
      CLUSTER_DATE
    )
    expect(ops.map((o) => [o.eventId, o.kind])).toEqual([
      ["one", "formConfig"],
      ["two", "occurrence"],
      ["three", "createSession"],
    ])
  })

  it("plans nothing for a day with no events", () => {
    expect(planClusterCheckinToggle([], true, CLUSTER_DATE)).toEqual([])
  })
})
