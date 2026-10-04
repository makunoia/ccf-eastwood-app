import { describe, expect, it } from "vitest"
import { sessionRegistrationStats, sessionTurnoutStats } from "@/lib/events/session-registration-stats"
import { validateSessionTargets, SessionTargetChanged } from "@/lib/events/session-registration"
import { buildClusterCheckinPeople } from "@/lib/clusters/checkin-person"
import { buildSessionAttendanceTable } from "@/lib/exports/session-attendance"

describe("session registration", () => {
  it("calculates session turnout from registrations and additional arrivals without double-counting", () => {
    const registered = Array.from({ length: 10 }, (_, i) => `member:${i}`)
    const present = [...registered.slice(0, 6), "guest:walk-in", "member:volunteer"]
    expect(sessionTurnoutStats(registered, present)).toEqual({ total: 12, checkedIn: 8, notCheckedIn: 4, rate: 8 / 12 })
    expect(sessionTurnoutStats(["member:a", "member:a"], ["member:a", "member:a"])).toEqual({ total: 1, checkedIn: 1, notCheckedIn: 0, rate: 1 })
    expect(sessionTurnoutStats([], ["guest:walk-in"]).rate).toBe(1)
    expect(sessionTurnoutStats(["member:a"], []).rate).toBe(0)
    expect(sessionTurnoutStats([], []).rate).toBeNull()
  })
  it("counts session registration arrivals separately from unregistered arrivals and deduplicates IDs", () => {
    expect(sessionRegistrationStats(["a", "a", "b"], ["a", "c", "c"])).toEqual({ expected: 2, checkedIn: 1, notCheckedIn: 1, rate: 0.5 })
    expect(sessionRegistrationStats([], ["a"]).rate).toBeNull()
  })
  it("requires the displayed session to match and ignores unselected event targets", () => {
    const targets = [{ eventId: "event", occurrenceId: "latest", label: "Latest" }, { eventId: "other", occurrenceId: null, label: "Missing" }]
    expect(() => validateSessionTargets(targets, { event: "old" }, ["event"])).toThrow(SessionTargetChanged)
    expect(() => validateSessionTargets(targets, { event: "latest" }, ["event"])).not.toThrow()
    expect(() => validateSessionTargets(targets, undefined, ["other"])).toThrow(SessionTargetChanged)
    expect(() => validateSessionTargets(null, undefined, ["event"])).not.toThrow()
  })
  it("gives a participant session registration precedence over a volunteer for that event cell", () => {
    const common = { key: "member:m", eventId: "event", alreadyCheckedIn: false, firstName: "Maria", lastName: "Santos", nickname: null, contactHint: null, isMember: true }
    const people = buildClusterCheckinPeople([{ eventId: "event", eventName: "Event", occurrenceId: "session", status: "open" }], [
      { ...common, subject: { kind: "volunteer", id: "v" }, alreadyCheckedIn: true },
      { ...common, subject: { kind: "registrant", id: "r" }, sessionParticipant: true },
    ])
    expect(people).toHaveLength(1)
    expect(people[0].events[0].subject).toEqual({ kind: "registrant", id: "r" })
  })
  it("exports a session registration without a check-in time", () => {
    const table = buildSessionAttendanceTable([{ sessionDate: "2026-10-04", seriesTitle: null, firstName: "Maria", lastName: "Santos", nickname: null, mobile: "", email: null, type: "Member", checkedInAt: null, sessionRegistration: true }], ["sessionRegistration", "attendance", "checkedInAt"])
    expect(table.cells[0]).toEqual(["Expected", "Not checked in", ""])
  })
})

import { isCheckinLive } from "@/lib/events/checkin-link"
it("a session registration kiosk requires its open switch even on the session date", () => {
  const today = "2026-10-04"
  expect(isCheckinLive({ isOpen: false, date: today, today, requiresOpen: true })).toBe(false)
  expect(isCheckinLive({ isOpen: true, date: today, today, requiresOpen: true })).toBe(true)
  expect(isCheckinLive({ isOpen: false, date: today, today })).toBe(true)
})
