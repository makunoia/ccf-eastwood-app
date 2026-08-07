import { describe, it, expect } from "vitest"
import {
  EVENT_FORMS,
  FORM_REGISTRY,
  eventFormsForModules,
  scopeKeyFor,
} from "@/lib/forms/registry"
import { formLayoutFor } from "@/lib/forms/context-config"

/**
 * Walk-in as a first-class form (CCF-133).
 *
 * It used to be the registration page plus `?checkin=`, which meant it had no
 * Forms hub row, no link to copy, and no switch of its own. These pin the shape
 * that fixes that — the parts a later refactor could quietly undo without any
 * visible failure until someone is standing at a door.
 */

describe("EventWalkIn form key", () => {
  it("is registered as an event-scoped form", () => {
    const meta = FORM_REGISTRY.EventWalkIn
    expect(meta).toBeDefined()
    expect(meta.scope).toBe("event")
    expect(meta.key).toBe("EventWalkIn")
  })

  it("exposes its own public path", () => {
    expect(FORM_REGISTRY.EventWalkIn.publicPath?.("evt_1")).toBe("/events/evt_1/walk-in")
  })

  it("is listed on an event with no modules enabled", () => {
    // Walk-in is not module-gated: every event has a door, whether or not it runs
    // volunteers, breakouts or catch mech.
    const keys = eventFormsForModules([]).map((f) => f.key)
    expect(keys).toContain("EventWalkIn")
    expect(FORM_REGISTRY.EventWalkIn.requiresEventModule).toBeUndefined()
  })

  it("takes the generic theme path", () => {
    // Registration themes itself from the Event's own page columns; walk-in has
    // none, so its overrides are the only source of its title/banner.
    expect(FORM_REGISTRY.EventWalkIn.themeFields).toContain("title")
    expect(FORM_REGISTRY.EventWalkIn.themeFields).toContain("bannerUrl")
  })

  it("renders the per-context builder", () => {
    // The editor page keys off this flag rather than naming keys.
    expect(FORM_REGISTRY.EventWalkIn.usesDedicatedConfig).toBe(true)
  })

  it("gets a config row distinct from the registration form's", () => {
    expect(scopeKeyFor("EventWalkIn", "evt_1")).not.toBe(
      scopeKeyFor("EventRegistration", "evt_1")
    )
  })

  it("does not collide with another form's icon", () => {
    // Two identical icons on the Forms hub read as one form listed twice.
    const walkIn = FORM_REGISTRY.EventWalkIn.icon
    const others = EVENT_FORMS.filter((f) => f.key !== "EventWalkIn").map((f) => f.icon)
    expect(others).not.toContain(walkIn)
  })
})

describe("registration form copy", () => {
  it("no longer claims to cover walk-in", () => {
    // The description named both surfaces while they shared a page. Leaving it
    // would send admins to the wrong entry to close the door.
    expect(FORM_REGISTRY.EventRegistration.description).not.toMatch(/walk-in/i)
  })
})

describe("WalkIn context layout", () => {
  it("is unchanged by the split", () => {
    // The form key is new; the FormContext is not. Walk-in has always had its own
    // section/field toggles — it just had nowhere of its own to live.
    expect(formLayoutFor("WalkIn")).toEqual(formLayoutFor("Register"))
  })
})
