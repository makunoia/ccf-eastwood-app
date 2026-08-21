import { describe, expect, it } from "vitest"

import {
  clusterCheckinClosedHint,
  clusterCheckinManageLabel,
  clusterOffersPerEventCheckin,
  resolveClusterCheckinShortcut,
} from "@/lib/clusters/checkin-shortcuts"

const NOW = new Date("2026-08-09T03:00:00.000Z")
/** Occurrence dates are stored at UTC midnight. */
const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const oneTime = { id: "e1", name: "Baptism Service", type: "OneTime" as const }
const recurring = { id: "e2", name: "Sunday Service", type: "Recurring" as const }
const multiDay = { id: "e3", name: "Camp", type: "MultiDay" as const }

describe("resolveClusterCheckinShortcut — OneTime", () => {
  it("links the event's own check-in form when the Public access switch is on", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: oneTime,
      formIsOpen: true,
      occurrence: null,
      now: NOW,
    })
    expect(shortcut).toMatchObject({
      href: "/events/e1/checkin",
      status: "open",
      sessionDate: null,
      eventName: "Baptism Service",
    })
  })

  it("offers no link — and points at the form config — when the switch is off", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: oneTime,
      formIsOpen: false,
      occurrence: null,
      now: NOW,
    })
    expect(shortcut.href).toBeNull()
    expect(shortcut.status).toBe("formClosed")
    expect(shortcut.manageHref).toBe("/event/e1/forms/EventCheckIn")
  })
})

describe("resolveClusterCheckinShortcut — session events", () => {
  it("links the session's own check-in route", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: recurring,
      formIsOpen: true,
      occurrence: { id: "o1", date: utcDay("2026-08-09"), isOpen: true },
      now: NOW,
    })
    expect(shortcut).toMatchObject({
      href: "/events/e2/checkin/o1",
      status: "open",
    })
    expect(shortcut.sessionDate).toEqual(utcDay("2026-08-09"))
  })

  it("stays open on the session's own date even when nobody flipped isOpen", () => {
    // Mirrors the public page's gate: today's session is always reachable.
    const shortcut = resolveClusterCheckinShortcut({
      event: recurring,
      formIsOpen: true,
      occurrence: { id: "o1", date: utcDay("2026-08-09"), isOpen: false },
      now: NOW,
    })
    expect(shortcut.status).toBe("open")
    expect(shortcut.href).toBe("/events/e2/checkin/o1")
  })

  it("stays open on another date once explicitly opened", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: recurring,
      formIsOpen: true,
      occurrence: { id: "o1", date: utcDay("2026-08-02"), isOpen: true },
      now: NOW,
    })
    expect(shortcut.status).toBe("open")
  })

  it("reports a past, unopened session as closed rather than linking to a dead page", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: recurring,
      formIsOpen: true,
      occurrence: { id: "o1", date: utcDay("2026-08-02"), isOpen: false },
      now: NOW,
    })
    expect(shortcut.href).toBeNull()
    expect(shortcut.status).toBe("sessionClosed")
    expect(shortcut.sessionDate).toEqual(utcDay("2026-08-02"))
    expect(shortcut.manageHref).toBe("/event/e2/sessions")
  })

  it("reports no session when the day has none", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: multiDay,
      formIsOpen: true,
      occurrence: null,
      now: NOW,
    })
    expect(shortcut).toMatchObject({
      href: null,
      status: "noSession",
      sessionDate: null,
      manageHref: "/event/e3/sessions",
    })
  })

  it("ignores the event-wide check-in switch — sessions are governed per occurrence", () => {
    const shortcut = resolveClusterCheckinShortcut({
      event: recurring,
      formIsOpen: false,
      occurrence: { id: "o1", date: utcDay("2026-08-09"), isOpen: true },
      now: NOW,
    })
    expect(shortcut.status).toBe("open")
    expect(shortcut.href).toBe("/events/e2/checkin/o1")
  })
})

describe("closed-state copy", () => {
  it("names the surface that fixes each closed status", () => {
    expect(clusterCheckinManageLabel("formClosed")).toBe("Open the check-in form")
    expect(clusterCheckinManageLabel("sessionClosed")).toBe("Open a session")
    expect(clusterCheckinManageLabel("noSession")).toBe("Open a session")
    expect(clusterCheckinClosedHint("noSession")).toBe("No session on this day")
  })
})

/**
 * Which kind of day gets per-event check-in doors at all.
 *
 * A Collab is one event wearing two ministries' names: the public kiosk names no
 * events, and a registrant belongs to exactly one member event — so a per-event
 * door on the admin board points at half the room. The rows' remaining job,
 * showing which member event was blocking the kiosk, moved to the day's own
 * switch (`setClusterCheckinOpen` opens every member event) and to Forms →
 * Check-in, which keeps the per-event read-out.
 */
describe("clusterOffersPerEventCheckin", () => {
  it("keeps the per-event doors on a Parallel day", () => {
    expect(clusterOffersPerEventCheckin("Parallel")).toBe(true)
  })

  it("drops them on a Collab day", () => {
    expect(clusterOffersPerEventCheckin("Collab")).toBe(false)
  })
})
