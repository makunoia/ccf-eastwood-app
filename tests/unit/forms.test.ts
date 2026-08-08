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
    expect(keys).toContain("EventCheckIn")
  })

  it("shows Catch Mech when the module is enabled", () => {
    const keys = eventFormsForModules(["CatchMech"]).map((f) => f.key)
    expect(keys).toContain("CatchMech")
  })

  it("gates the three volunteer forms on the Volunteers module", () => {
    const keys = eventFormsForModules(["Volunteers"]).map((f) => f.key)
    expect(keys).toContain("VolunteerSignUp")
    expect(keys).toContain("VolunteerInfo")
    expect(keys).toContain("VolunteerApproval")
  })

  it("only filters module-gated forms — others stay regardless", () => {
    const gated = EVENT_FORMS.filter((f) => f.requiresEventModule).length
    expect(eventFormsForModules([]).length).toBe(EVENT_FORMS.length - gated)
    expect(eventFormsForModules(["CatchMech", "Baptism", "Volunteers"]).length).toBe(
      EVENT_FORMS.length
    )
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

  it("has no theme fields — it isn't a branded public page", () => {
    expect(FORM_REGISTRY.EventCheckIn.themeFields).toEqual([])
  })

  it("keeps every registry entry's key matching its record key", () => {
    for (const [key, meta] of Object.entries(FORM_REGISTRY)) {
      expect(meta.key, key).toBe(key)
    }
  })
})

/**
 * Where the Public access switch applies to check-in.
 *
 * Check-in used to render no open/closed control at all, on the reasoning that
 * sessions own availability via `EventOccurrence.isOpen`. That covered
 * MultiDay/Recurring but not OneTime, which has no occurrences — its check-in
 * link was permanently live with no way to close it.
 *
 * The split now follows the data: OneTime gets the switch (its only control),
 * session-based events keep the Public access section but swap the switch for a
 * link to Sessions/Days, where the real per-occurrence state lives.
 */
describe("forms — the OneTime check-in surface honors FormConfig.isOpen", () => {
  const source = readFileSync(
    join(process.cwd(), "app/events/[id]/checkin/page.tsx"),
    "utf8"
  )

  it("reads the check-in FormConfig and renders FormClosed", () => {
    expect(source).toContain('getFormConfig("EventCheckIn"')
    expect(source).toContain("if (!formConfig.isOpen) return <FormClosed")
  })

  it("gates only after the MultiDay/Recurring branch has returned", () => {
    // Session events short-circuit to a "use the session link" signpost above
    // this point, so the gate is reached for OneTime alone.
    const branchIdx = source.indexOf('event.type === "Recurring" || event.type === "MultiDay"')
    const gateIdx = source.indexOf("if (!formConfig.isOpen)")
    expect(branchIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeGreaterThan(branchIdx)
  })
})

describe("forms — the per-occurrence check-in surface has no event-wide gate", () => {
  const source = readFileSync(
    join(process.cwd(), "app/events/[id]/checkin/[occurrenceId]/page.tsx"),
    "utf8"
  )

  it("never reads the check-in form's config, which has no switch behind it", () => {
    // Reading a flag with no UI behind it would strand an event that was closed
    // as OneTime and later converted to Recurring: closed, with nothing to reopen it.
    // Session events open per occurrence, so `EventOccurrence.isOpen` is the only
    // gate this page may consult.
    expect(source).not.toContain('getFormConfig("EventCheckIn"')
  })

  it("never closes itself on a form config", () => {
    // The `EventWalkIn` config *is* read here (CCF-133), but only to decide
    // whether to offer the walk-in link. It must never gate check-in itself.
    expect(source).not.toContain("FormClosed")
  })
})

describe("forms — the Public access section appears on every form", () => {
  const page = readFileSync(
    join(process.cwd(), "app/(event)/event/[id]/forms/[key]/page.tsx"),
    "utf8"
  )

  it("has no per-form opt-out flag any more", () => {
    // EventCheckIn used to carry `omitsFormConfigEditor` and was the only form
    // whose config page lacked the section entirely. The flag is gone.
    const registry = readFileSync(join(process.cwd(), "lib/forms/registry.ts"), "utf8")
    expect(registry).not.toContain("omitsFormConfigEditor")
    expect(page).not.toContain("omitsFormConfigEditor")
  })

  it("swaps the switch for a Sessions link only when check-in opens per session", () => {
    expect(page).toContain("checkInOpensPerSession")
    expect(page).toContain('meta.key === "EventCheckIn" && event.type !== "OneTime"')
    // Both arms render something in the slot — the section never disappears.
    expect(page).toContain('title="Public access"')
    expect(page).toContain("<FormConfigEditor")
  })

  it("omits the View public form link for check-in", () => {
    // The check-in page is an attendee kiosk — nothing an admin needs to open
    // from the config screen. The registry keeps publicPath for revalidation
    // and the cluster listing, so only the editor's link is suppressed.
    expect(page).toContain('publicUrl={meta.key === "EventCheckIn" ? undefined')
    expect(FORM_REGISTRY.EventCheckIn.publicPath?.("evt1")).toBe("/events/evt1/checkin")
  })

  it("labels the destination the way the Sessions page does", () => {
    // "Sessions" for Recurring, "Days" for MultiDay — sending someone to a screen
    // by a name it doesn't use is how a redirect stops feeling like one.
    expect(page).toContain('event.type === "Recurring" ? "Sessions" : "Days"')
    expect(page).toContain("Go to {sessionsLabel}")
  })
})
