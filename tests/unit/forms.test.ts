import { describe, it, expect } from "vitest"
import { scopeKeyFor, eventFormsForModules, EVENT_FORMS } from "@/lib/forms/registry"
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
