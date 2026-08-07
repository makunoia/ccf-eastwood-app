import { describe, it, expect } from "vitest"
import {
  resolveWalkInAccess,
  walkInClosedAdminHint,
  WALK_IN_CLOSED_MESSAGE,
} from "@/lib/events/walk-in-access"
import { FORM_REGISTRY, defaultIsOpen } from "@/lib/forms/registry"

/**
 * Walk-in reachability (CCF-133, PR 2).
 *
 * Two gates that must both pass, and neither of them is the registration form's.
 * The rule lives in one pure function because three surfaces read it — the
 * walk-in page itself and both check-in boards that link to it — and a board
 * offering a link to a closed door is exactly the bug this prevents.
 */

const OPEN_SESSION = { id: "occ_1", isOpen: true }
const CLOSED_SESSION = { id: "occ_1", isOpen: false }

describe("resolveWalkInAccess", () => {
  describe("the form's own switch", () => {
    it("closes the door when off, whatever the session says", () => {
      const result = resolveWalkInAccess({
        eventType: "Recurring",
        formIsOpen: false,
        session: OPEN_SESSION,
      })
      expect(result).toEqual({ open: false, reason: "formClosed" })
    })

    it("closes a OneTime event too, which has no session to fall back on", () => {
      const result = resolveWalkInAccess({
        eventType: "OneTime",
        formIsOpen: false,
        session: null,
      })
      expect(result).toEqual({ open: false, reason: "formClosed" })
    })
  })

  describe("the configured session", () => {
    it("opens against the named session", () => {
      const result = resolveWalkInAccess({
        eventType: "Recurring",
        formIsOpen: true,
        session: OPEN_SESSION,
      })
      expect(result).toEqual({ open: true, occurrenceId: "occ_1" })
    })

    it("closes when no session is selected", () => {
      const result = resolveWalkInAccess({
        eventType: "Recurring",
        formIsOpen: true,
        session: null,
      })
      expect(result).toEqual({ open: false, reason: "noSession" })
    })

    it("closes when the selected session is closed", () => {
      // Same reason as unset on purpose: from the door's point of view there is
      // nothing to register into either way.
      const result = resolveWalkInAccess({
        eventType: "Recurring",
        formIsOpen: true,
        session: CLOSED_SESSION,
      })
      expect(result).toEqual({ open: false, reason: "noSession" })
    })

    it("applies to MultiDay as well as Recurring", () => {
      expect(
        resolveWalkInAccess({ eventType: "MultiDay", formIsOpen: true, session: null })
      ).toEqual({ open: false, reason: "noSession" })
      expect(
        resolveWalkInAccess({
          eventType: "MultiDay",
          formIsOpen: true,
          session: OPEN_SESSION,
        })
      ).toEqual({ open: true, occurrenceId: "occ_1" })
    })
  })

  describe("OneTime events", () => {
    it("opens with no session at all — attendance is stamped on the registrant", () => {
      const result = resolveWalkInAccess({
        eventType: "OneTime",
        formIsOpen: true,
        session: null,
      })
      expect(result).toEqual({ open: true, occurrenceId: null })
    })

    it("ignores a stray session rather than checking someone into it", () => {
      const result = resolveWalkInAccess({
        eventType: "OneTime",
        formIsOpen: true,
        session: OPEN_SESSION,
      })
      expect(result).toEqual({ open: true, occurrenceId: null })
    })
  })
})

describe("closed-door copy", () => {
  it("keeps the public message free of admin instructions", () => {
    // The check-in board is a public kiosk. Telling an attendee to open a switch
    // — or naming the page that holds it — is guidance they can't act on and a
    // route they shouldn't be pointed at.
    expect(WALK_IN_CLOSED_MESSAGE).not.toMatch(/switch|form config|settings|admin/i)
    expect(WALK_IN_CLOSED_MESSAGE).toMatch(/staff/i)
  })

  it("distinguishes the two closed reasons for staff", () => {
    expect(walkInClosedAdminHint("formClosed")).not.toBe(
      walkInClosedAdminHint("noSession")
    )
    expect(walkInClosedAdminHint("noSession")).toMatch(/session/i)
  })
})

describe("per-form open default", () => {
  it("starts walk-in closed", () => {
    // A standalone URL that registers *and* records attendance is a live
    // attendance surface — it waits to be opened for the day.
    expect(defaultIsOpen("EventWalkIn")).toBe(false)
  })

  it("leaves every other form open", () => {
    const others = Object.keys(FORM_REGISTRY).filter((k) => k !== "EventWalkIn")
    for (const key of others) {
      expect(defaultIsOpen(key as keyof typeof FORM_REGISTRY)).toBe(true)
    }
  })
})
