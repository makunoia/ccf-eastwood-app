import { describe, it, expect } from "vitest"
import {
  ADMIN_INTENT_TOGGLE_KEYS,
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXTS,
  FORM_FIELD_KEYS,
  FORM_OPTION_KEYS,
  FORM_PERSISTED_KEYS,
  FORM_REQUIRED_KEYS,
  FORM_SECTION_KEYS,
  FORM_TOGGLE_KEYS,
  IDENTITY_FIELD_KEYS,
  REQUIRABLE_SECTION_KEYS,
  isRequirableSection,
} from "@/lib/forms/context-config"
import { missingRequiredFields } from "@/lib/forms/registration-payload"

/**
 * The registration form's toggle registry (CCF-117 / CCF-119 / CCF-142).
 *
 * Promoted out of the gitignored `tests/tickets/` so it actually runs in CI.
 * Rewritten on the way: the originals asserted `FORM_FIELD_KEYS` had exactly
 * eight entries and listed all eight by name, so every new field failed a test
 * that had found no bug — three fields later (nickname, then mobile and email
 * when CCF-142 made them configurable) they were red and being ignored.
 *
 * What is actually worth pinning is the registry's *shape*: that the derived
 * lists stay in step with the primary ones, that Required flags pair off
 * mechanically, and that "bare" means identity-only. Those hold at any number
 * of fields, so adding one changes nothing here — and breaking the pairing
 * still fails loudly.
 */

describe("the toggle registry composes from its parts", () => {
  it("is the sections, the fields and the options, with nothing else in it", () => {
    expect([...FORM_TOGGLE_KEYS].sort()).toEqual(
      [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS, ...FORM_OPTION_KEYS].sort()
    )
  })

  it("keeps sections, fields and options disjoint", () => {
    const all = [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS, ...FORM_OPTION_KEYS]
    expect(new Set(all).size).toBe(all.length)
  })

  it("names sections and fields by their prefix", () => {
    // The builder groups by prefix, so a mis-prefixed key lands in the wrong pane.
    expect(FORM_SECTION_KEYS.every((k) => k.startsWith("section"))).toBe(true)
    expect(FORM_FIELD_KEYS.every((k) => k.startsWith("field"))).toBe(true)
  })

  it("persists every toggle and every Required flag", () => {
    expect([...FORM_PERSISTED_KEYS].sort()).toEqual(
      [...FORM_TOGGLE_KEYS, ...FORM_REQUIRED_KEYS].sort()
    )
  })
})

describe("Required flags pair off with what can be answered", () => {
  it("gives every field and every requirable section exactly one, named mechanically", () => {
    // `<key>Required` is a template type, not a lookup table — the point is that
    // nobody can add a field and forget to add its flag.
    expect([...FORM_REQUIRED_KEYS].sort()).toEqual(
      [...FORM_FIELD_KEYS, ...REQUIRABLE_SECTION_KEYS].map((k) => `${k}Required`).sort()
    )
  })

  it("gives one only to the sections that own a single stored answer", () => {
    // Dietary has `dietaryPreference` and Payment has `paymentReference`. The
    // other three have no answer that can be blank: Breakout is satisfiable by
    // auto-assign, an empty household is legitimate, and the DGroup step already
    // makes you answer its intent. Requiring one of those would enforce something
    // the form can meet by accident.
    expect([...REQUIRABLE_SECTION_KEYS]).toEqual(["sectionDietary", "sectionPayment"])

    const notRequirable = FORM_SECTION_KEYS.filter((k) => !isRequirableSection(k))
    for (const key of [...notRequirable, ...FORM_OPTION_KEYS]) {
      expect(FORM_REQUIRED_KEYS as readonly string[]).not.toContain(`${key}Required`)
    }
  })

  it("carries a payload key for every requirable section, or Required means nothing", () => {
    // The twin of `fieldKeysWithoutGate` for sections: a Required flag with no
    // answer behind it would be a switch that does nothing.
    for (const key of REQUIRABLE_SECTION_KEYS) {
      expect(missingRequiredFields({ ...BARE_EVENT_FORM_CONFIG, [key]: true, [`${key}Required`]: true }, {})).toContain(key)
    }
  })
})

describe("the bare form", () => {
  it("carries a value for every persisted key", () => {
    expect(Object.keys(BARE_EVENT_FORM_CONFIG).sort()).toEqual([...FORM_PERSISTED_KEYS].sort())
  })

  it("is identity-only — the identity fields on, every other toggle off", () => {
    // CCF-142 made mobile and email toggles. They were hardcoded always-on
    // before, so "bare" means identity-only rather than empty; anything else
    // defaulting true would silently opt every new event into a question.
    for (const key of FORM_TOGGLE_KEYS) {
      expect(BARE_EVENT_FORM_CONFIG[key], key).toBe(
        (IDENTITY_FIELD_KEYS as readonly string[]).includes(key)
      )
    }
  })

  it("requires nothing", () => {
    for (const key of FORM_REQUIRED_KEYS) {
      expect(BARE_EVENT_FORM_CONFIG[key], key).toBe(false)
    }
  })
})

describe("admin-intent toggles", () => {
  it("exclude anything a migration could have switched on", () => {
    // These answer "has an admin been through the builder?", so a toggle that
    // arrives on without anyone choosing it must not count. Nickname is
    // backfilled true for every pre-existing event, and the identity fields
    // default true — see lib/events/setup-checklist.ts.
    expect(ADMIN_INTENT_TOGGLE_KEYS).not.toContain("fieldNickname")
    for (const key of IDENTITY_FIELD_KEYS) {
      expect(ADMIN_INTENT_TOGGLE_KEYS as readonly string[]).not.toContain(key)
    }
  })

  it("are all real toggles, and are off in a bare config", () => {
    for (const key of ADMIN_INTENT_TOGGLE_KEYS) {
      expect(FORM_TOGGLE_KEYS, key).toContain(key)
      expect(BARE_EVENT_FORM_CONFIG[key], key).toBe(false)
    }
  })
})

describe("form contexts", () => {
  it("are the three surfaces a form can be configured for", () => {
    // Fixed by the FormContext enum in the schema, so this one is a true
    // closed set rather than a list that grows.
    expect(FORM_CONTEXTS).toEqual(["Register", "WalkIn", "CheckIn"])
  })
})
