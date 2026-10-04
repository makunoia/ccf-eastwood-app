import { describe, expect, it } from "vitest"
import { sessionRsvpStats } from "@/lib/events/session-rsvp-stats"
import { validateRsvpTargets, RsvpTargetChanged } from "@/lib/events/session-rsvp"
import { buildClusterCheckinPeople } from "@/lib/clusters/checkin-person"
import { buildSessionAttendanceTable } from "@/lib/exports/session-attendance"

describe("session RSVP", () => {
  it("counts RSVP arrivals separately from unregistered arrivals and deduplicates IDs", () => {
    expect(sessionRsvpStats(["a", "a", "b"], ["a", "c", "c"])).toEqual({ expected: 2, checkedIn: 1, notCheckedIn: 1, rate: 0.5 })
    expect(sessionRsvpStats([], ["a"]).rate).toBeNull()
  })
  it("requires the displayed session to match and ignores unselected event targets", () => {
    const targets = [{ eventId: "event", occurrenceId: "latest", label: "Latest" }, { eventId: "other", occurrenceId: null, label: "Missing" }]
    expect(() => validateRsvpTargets(targets, { event: "old" }, ["event"])).toThrow(RsvpTargetChanged)
    expect(() => validateRsvpTargets(targets, { event: "latest" }, ["event"])).not.toThrow()
    expect(() => validateRsvpTargets(targets, undefined, ["other"])).toThrow(RsvpTargetChanged)
    expect(() => validateRsvpTargets(null, undefined, ["event"])).not.toThrow()
  })
  it("gives a participant RSVP precedence over a volunteer for that event cell", () => {
    const common = { key: "member:m", eventId: "event", alreadyCheckedIn: false, firstName: "Maria", lastName: "Santos", nickname: null, contactHint: null, isMember: true }
    const people = buildClusterCheckinPeople([{ eventId: "event", eventName: "Event", occurrenceId: "session", status: "open" }], [
      { ...common, subject: { kind: "volunteer", id: "v" }, alreadyCheckedIn: true },
      { ...common, subject: { kind: "registrant", id: "r" }, participantRsvp: true },
    ])
    expect(people).toHaveLength(1)
    expect(people[0].events[0].subject).toEqual({ kind: "registrant", id: "r" })
  })
  it("exports an RSVP without a check-in time", () => {
    const table = buildSessionAttendanceTable([{ sessionDate: "2026-10-04", seriesTitle: null, firstName: "Maria", lastName: "Santos", nickname: null, mobile: "", email: null, type: "Member", checkedInAt: null, rsvp: true }], ["rsvp", "attendance", "checkedInAt"])
    expect(table.cells[0]).toEqual(["Expected", "Not checked in", ""])
  })
})

import { isCheckinLive } from "@/lib/events/checkin-link"
it("a session RSVP kiosk requires its open switch even on the session date", () => {
  const today = "2026-10-04"
  expect(isCheckinLive({ isOpen: false, date: today, today, requiresOpen: true })).toBe(false)
  expect(isCheckinLive({ isOpen: true, date: today, today, requiresOpen: true })).toBe(true)
  expect(isCheckinLive({ isOpen: false, date: today, today })).toBe(true)
})
