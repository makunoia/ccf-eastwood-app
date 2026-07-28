import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  scopeKeyFor,
  eventFormsForModules,
  EVENT_FORMS,
  FORM_REGISTRY,
} from "@/lib/forms/registry"
import { resolveFormTheme, type FormConfigData } from "@/lib/forms/config"

/**
 * Forms feature — pure logic.
 *  - scopeKeyFor: deterministic unique key for global vs event-scoped configs
 *  - eventFormsForModules: module-gated visibility (Catch Mech)
 *  - resolveFormTheme: override > fallback > null precedence
 */

function baseConfig(overrides: Partial<FormConfigData> = {}): FormConfigData {
  return {
    key: "JoinSmallGroup",
    eventId: null,
    isOpen: true,
    title: null,
    description: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    ...overrides,
  }
}

describe("forms — scopeKeyFor", () => {
  it("prefixes global for forms with no event", () => {
    expect(scopeKeyFor("JoinSmallGroup")).toBe("global:JoinSmallGroup")
    expect(scopeKeyFor("JoinSmallGroup", null)).toBe("global:JoinSmallGroup")
  })

  it("prefixes the event id for event-scoped forms", () => {
    expect(scopeKeyFor("EventRegistration", "evt_123")).toBe("evt_123:EventRegistration")
  })

  it("produces distinct keys per event for the same form", () => {
    expect(scopeKeyFor("CatchMech", "a")).not.toBe(scopeKeyFor("CatchMech", "b"))
  })
})

describe("forms — eventFormsForModules", () => {
  it("hides Catch Mech when the module is not enabled", () => {
    const keys = eventFormsForModules([]).map((f) => f.key)
    expect(keys).not.toContain("CatchMech")
    // Non-module event forms are always present
    expect(keys).toContain("EventRegistration")
    expect(keys).toContain("VolunteerSignUp")
  })

  it("shows Catch Mech when the module is enabled", () => {
    const keys = eventFormsForModules(["CatchMech"]).map((f) => f.key)
    expect(keys).toContain("CatchMech")
  })

  it("only filters module-gated forms — others stay regardless", () => {
    expect(eventFormsForModules([]).length).toBe(EVENT_FORMS.length - 1)
    expect(eventFormsForModules(["CatchMech", "Baptism"]).length).toBe(EVENT_FORMS.length)
  })
})

describe("forms — resolveFormTheme", () => {
  it("uses the override when present", () => {
    const theme = resolveFormTheme(
      baseConfig({ title: "Custom", primaryColor: "#ff0000" }),
      { title: "Default", primaryColor: "#000000" }
    )
    expect(theme.title).toBe("Custom")
    expect(theme.primaryColor).toBe("#ff0000")
  })

  it("falls back when the override is null", () => {
    const theme = resolveFormTheme(baseConfig(), {
      title: "Default",
      description: "Fallback desc",
      logoUrl: "logo.png",
    })
    expect(theme.title).toBe("Default")
    expect(theme.description).toBe("Fallback desc")
    expect(theme.logoUrl).toBe("logo.png")
  })

  it("returns null when neither override nor fallback is set", () => {
    const theme = resolveFormTheme(baseConfig(), {})
    expect(theme.title).toBeNull()
    expect(theme.bannerUrl).toBeNull()
    expect(theme.primaryColor).toBeNull()
  })
})

describe("forms — Check-in is its own event form", () => {
  /**
   * Check-in used to be a third tab inside the Registration form editor, which made
   * that page hard to read: Register and Walk-in drive the same component, whereas
   * Check-in is a different surface with a different shape (no payment, no breakout
   * picker, no birth date, matching fields not nested under DGroup). It is now its
   * own entry on the event Forms page.
   */
  it("is registered as an event-scoped form", () => {
    const checkIn = FORM_REGISTRY.EventCheckIn
    expect(checkIn.scope).toBe("event")
    expect(checkIn.label).toBe("Check-in Form")
    expect(EVENT_FORMS.map((f) => f.key)).toContain("EventCheckIn")
  })

  it("points at the public check-in URL", () => {
    expect(FORM_REGISTRY.EventCheckIn.publicPath?.("evt1")).toBe("/events/evt1/checkin")
  })

  it("is listed regardless of enabled modules", () => {
    // Unlike Catch Mech, check-in isn't module-gated — every event checks people in.
    expect(eventFormsForModules([]).map((f) => f.key)).toContain("EventCheckIn")
  })

  it("omits the shared open/closed editor, since sessions own that", () => {
    // Rendering an isOpen toggle here would be a dead control: the public check-in
    // page never reads FormConfig.isOpen — availability comes from
    // EventOccurrence.isOpen per session.
    expect(FORM_REGISTRY.EventCheckIn.omitsFormConfigEditor).toBe(true)
  })

  it("is the only form that opts out of that editor", () => {
    const opted = Object.values(FORM_REGISTRY).filter((f) => f.omitsFormConfigEditor)
    expect(opted.map((f) => f.key)).toEqual(["EventCheckIn"])
  })

  it("has no theme fields — it isn't a branded public page", () => {
    expect(FORM_REGISTRY.EventCheckIn.themeFields).toEqual([])
  })

  it("keeps every registry entry's key matching its record key", () => {
    for (const [key, meta] of Object.entries(FORM_REGISTRY)) {
      expect(meta.key, key).toBe(key)
    }
  })
})

describe("forms — the public check-in page has no FormConfig gate", () => {
  it("never reads FormConfig, so no open/closed toggle may claim to control it", () => {
    // Pins the reason EventCheckIn sets omitsFormConfigEditor. If check-in ever
    // does start honoring FormConfig.isOpen, this fails and the flag should go.
    const source = readFileSync(
      join(process.cwd(), "app/events/[id]/checkin/page.tsx"),
      "utf8"
    )
    expect(source).not.toContain("getFormConfig")
  })
})
