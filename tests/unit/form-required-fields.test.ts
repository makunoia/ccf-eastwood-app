import { describe, it, expect } from "vitest"
import {
  ADMIN_INTENT_TOGGLE_KEYS,
  BARE_EVENT_FORM_CONFIG,
  FORM_FIELD_KEYS,
  FORM_PERSISTED_KEYS,
  FORM_REQUIRED_KEYS,
  FORM_TOGGLE_DEFAULTS,
  IDENTITY_FIELD_KEYS,
  REQUIRABLE_KEYS,
  fieldsForContext,
  hasIdentityField,
  requiredKeyFor,
  type EventFormConfigData,
  type RequirableKey,
} from "@/lib/forms/context-config"
import {
  askedFieldsFor,
  fieldKeysWithoutGate,
  missingRequiredFields,
  omitDisabledFields,
  requiredFieldsMessage,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"

/**
 * CCF-142 — mobile/email as configurable fields, and per-field Required.
 */

function config(overrides: Partial<EventFormConfigData> = {}): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...overrides }
}

/** A field or requirable section switched on and marked required, in one go. */
function required(key: RequirableKey): Partial<EventFormConfigData> {
  return { [key]: true, [requiredKeyFor(key)]: true } as Partial<EventFormConfigData>
}

describe("the field model", () => {
  it("pairs every field and requirable section with a Required key", () => {
    expect(FORM_REQUIRED_KEYS).toHaveLength(REQUIRABLE_KEYS.length)
    for (const key of REQUIRABLE_KEYS) {
      expect(requiredKeyFor(key)).toBe(`${key}Required`)
      expect(FORM_PERSISTED_KEYS).toContain(requiredKeyFor(key))
    }
  })

  it("gates every field on at least one payload key", () => {
    expect(fieldKeysWithoutGate()).toEqual([])
  })

  it("defaults mobile and email on, and everything else off", () => {
    for (const key of FORM_PERSISTED_KEYS) {
      expect(FORM_TOGGLE_DEFAULTS[key]).toBe(
        (IDENTITY_FIELD_KEYS as readonly string[]).includes(key)
      )
    }
  })

  it("keeps mobile and email on a bare config", () => {
    // Regression: "bare" used to mean every column false. A missing config row
    // resolves through these defaults, so an event nobody has configured must
    // still ask for something that identifies a person.
    expect(BARE_EVENT_FORM_CONFIG.fieldMobile).toBe(true)
    expect(BARE_EVENT_FORM_CONFIG.fieldEmail).toBe(true)
    expect(BARE_EVENT_FORM_CONFIG.fieldLifeStage).toBe(false)
    for (const key of FORM_REQUIRED_KEYS) {
      expect(BARE_EVENT_FORM_CONFIG[key]).toBe(false)
    }
  })

  it("doesn't count a default-on toggle as admin intent", () => {
    // Otherwise every untouched event would report a configured form.
    expect(ADMIN_INTENT_TOGGLE_KEYS).not.toContain("fieldMobile")
    expect(ADMIN_INTENT_TOGGLE_KEYS).not.toContain("fieldEmail")
    expect(ADMIN_INTENT_TOGGLE_KEYS).not.toContain("fieldNickname")
    expect(ADMIN_INTENT_TOGGLE_KEYS).toContain("fieldLifeStage")
  })
})

describe("hasIdentityField", () => {
  it.each([
    [{ fieldMobile: true, fieldEmail: true }, true],
    [{ fieldMobile: true, fieldEmail: false }, true],
    [{ fieldMobile: false, fieldEmail: true }, true],
    [{ fieldMobile: false, fieldEmail: false }, false],
  ])("%o → %s", (flags, expected) => {
    expect(hasIdentityField(flags)).toBe(expected)
  })
})

describe("missingRequiredFields", () => {
  it("flags an enabled, required field left blank", () => {
    const cfg = config(required("fieldLifeStage"))
    expect(missingRequiredFields(cfg, { lifeStageId: null })).toEqual(["fieldLifeStage"])
    expect(missingRequiredFields(cfg, { lifeStageId: "" })).toEqual(["fieldLifeStage"])
    expect(missingRequiredFields(cfg, { lifeStageId: "ls_1" })).toEqual([])
  })

  it("ignores a required flag on a disabled field", () => {
    // Switching a field off doesn't clear its flag, so the read side has to be
    // the one that ignores it — otherwise the form becomes unsubmittable for a
    // question it no longer asks.
    const cfg = config({ fieldLifeStage: false, fieldLifeStageRequired: true })
    expect(missingRequiredFields(cfg, { lifeStageId: null })).toEqual([])
  })

  it("ignores an enabled field that isn't required", () => {
    const cfg = config({ fieldLifeStage: true })
    expect(missingRequiredFields(cfg, { lifeStageId: null })).toEqual([])
  })

  it("treats an empty language list as unanswered", () => {
    const cfg = config(required("fieldLanguage"))
    expect(missingRequiredFields(cfg, { language: [] })).toEqual(["fieldLanguage"])
    expect(missingRequiredFields(cfg, { language: ["English"] })).toEqual([])
  })

  it("wants both halves of a birth date", () => {
    const cfg = config(required("fieldBirthDate"))
    expect(missingRequiredFields(cfg, { birthMonth: 5, birthYear: null })).toEqual([
      "fieldBirthDate",
    ])
    expect(missingRequiredFields(cfg, { birthMonth: null, birthYear: 1990 })).toEqual([
      "fieldBirthDate",
    ])
    expect(missingRequiredFields(cfg, { birthMonth: 5, birthYear: 1990 })).toEqual([])
  })

  it("wants only the day of a schedule, and accepts Sunday", () => {
    const cfg = config(required("fieldSchedule"))
    expect(missingRequiredFields(cfg, { scheduleDayOfWeek: null })).toEqual(["fieldSchedule"])
    // 0 is Sunday. A falsy check here would reject every Sunday answer.
    expect(missingRequiredFields(cfg, { scheduleDayOfWeek: 0 })).toEqual([])
    // "Any time" is a real answer, so the window itself is never demanded.
    expect(
      missingRequiredFields(cfg, { scheduleDayOfWeek: 2, scheduleTimeStart: null })
    ).toEqual([])
  })

  it("covers mobile and email", () => {
    expect(
      missingRequiredFields(config(required("fieldMobile")), { mobileNumber: "" })
    ).toEqual(["fieldMobile"])
    expect(
      missingRequiredFields(config(required("fieldEmail")), { email: null })
    ).toEqual(["fieldEmail"])
  })

  it("reports several at once, and narrows to a subset when asked", () => {
    const cfg = config({ ...required("fieldGender"), ...required("fieldAgeRange") })
    expect(missingRequiredFields(cfg, {})).toEqual(["fieldGender", "fieldAgeRange"])
    expect(missingRequiredFields(cfg, {}, ["fieldGender"])).toEqual(["fieldGender"])
  })
})

/**
 * Dietary and Payment can be marked Required even though they have no fields —
 * the section *is* the answer. This is what makes "the admin added a dietary
 * question after people registered" a thing the form can act on.
 */
describe("missingRequiredFields — requirable sections", () => {
  it("flags an enabled, required Dietary section left blank", () => {
    const cfg = config(required("sectionDietary"))
    expect(missingRequiredFields(cfg, { dietaryPreference: null })).toEqual(["sectionDietary"])
    expect(missingRequiredFields(cfg, { dietaryPreference: "Vegan" })).toEqual([])
  })

  it("flags an enabled, required Payment section left blank", () => {
    const cfg = config(required("sectionPayment"))
    expect(missingRequiredFields(cfg, { paymentReference: null })).toEqual(["sectionPayment"])
    expect(missingRequiredFields(cfg, { paymentReference: "GCash-1" })).toEqual([])
  })

  it("ignores the flag when the section is switched off", () => {
    // Same rule as fields: a stale Required on a disabled section is ignored on
    // read rather than cleared on write, so switching it back on restores it.
    const cfg = config({ sectionDietary: false, sectionDietaryRequired: true })
    expect(missingRequiredFields(cfg, { dietaryPreference: null })).toEqual([])
  })

  it("does not demand the free-text tail of Other", () => {
    // `dietaryOther` is the note attached to one choice, not a second answer —
    // requiring it would make every non-Other selection fail.
    const cfg = config(required("sectionDietary"))
    expect(missingRequiredFields(cfg, { dietaryPreference: "Halal", dietaryOther: null })).toEqual([])
  })

  it("names the section by its builder label in the error", () => {
    expect(requiredFieldsMessage(["sectionDietary"])).toBe("Dietary Restrictions is required.")
    expect(requiredFieldsMessage(["fieldLifeStage", "sectionDietary"])).toBe(
      "These are required: Life Stage, Dietary Restrictions."
    )
  })
})

describe("askedFieldsFor", () => {
  it("includes the requirable sections a context has", () => {
    // Unlike the DGroup-nested fields, nothing can hide these behind an answer —
    // they are steps in their own right.
    expect(askedFieldsFor("Register", {})).toContain("sectionDietary")
    expect(askedFieldsFor("Register", {})).toContain("sectionPayment")
  })

  it("omits them on Check-in, which has neither step", () => {
    expect(askedFieldsFor("CheckIn", {})).not.toContain("sectionDietary")
    expect(askedFieldsFor("CheckIn", {})).not.toContain("sectionPayment")
  })

  it("drops the DGroup-nested fields when the person isn't looking for a group", () => {
    // Regression: requiring a matching field would otherwise block everyone who
    // answers "I'm already in a DGroup" on a question they were never shown.
    const asked = askedFieldsFor("Register", { wantsSmallGroup: false })
    expect(asked).not.toContain("fieldLanguage")
    expect(asked).not.toContain("fieldWorkCity")
    expect(asked).toContain("fieldMobile")
    expect(asked).toContain("fieldLifeStage")
  })

  it("includes them once they say they are", () => {
    const asked = askedFieldsFor("Register", { wantsSmallGroup: true })
    expect(asked).toContain("fieldLanguage")
    expect(asked).toContain("fieldWorkCity")
  })

  it("does not block a registration that skipped the DGroup step", () => {
    const cfg = config({ sectionSmallGroup: true, ...required("fieldLanguage") })
    const payload = { wantsSmallGroup: false, language: [] }
    expect(
      missingRequiredFields(cfg, payload, askedFieldsFor("Register", payload))
    ).toEqual([])
  })
})

describe("fieldsForContext", () => {
  it("excludes what check-in never asks", () => {
    const checkIn = fieldsForContext("CheckIn")
    for (const key of ["fieldMobile", "fieldEmail", "fieldBirthDate", "fieldNickname"]) {
      expect(checkIn).not.toContain(key)
    }
    expect(checkIn).toContain("fieldLifeStage")
  })

  it("covers the whole field list on Register", () => {
    expect([...fieldsForContext("Register")].sort()).toEqual([...FORM_FIELD_KEYS].sort())
  })
})

describe("omitDisabledFields", () => {
  it("removes a disabled field's key rather than nulling it", () => {
    // The profile writers read an explicit null as "clear this column", so
    // nulling here would erase an answer the person gave elsewhere.
    const cfg = config({ fieldWorkCity: false, fieldGender: true })
    const out = omitDisabledFields(cfg, { workCity: "Makati", gender: "Male" })
    expect("workCity" in out).toBe(false)
    expect(out.gender).toBe("Male")
  })

  it("differs from sanitizeRegistrantPayload, which nulls in place", () => {
    const cfg = config({ fieldWorkCity: false })
    const sanitized = sanitizeRegistrantPayload(cfg, { workCity: "Makati" })
    expect(sanitized).toEqual({ workCity: null })
  })
})

describe("requiredFieldsMessage", () => {
  it("names one field in the singular", () => {
    expect(requiredFieldsMessage(["fieldMobile"])).toBe("Mobile Number is required.")
  })

  it("lists several", () => {
    expect(requiredFieldsMessage(["fieldMobile", "fieldLifeStage"])).toBe(
      "These are required: Mobile Number, Life Stage."
    )
  })
})
