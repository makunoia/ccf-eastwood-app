import { describe, it, expect } from "vitest"
import {
  BARE_EVENT_FORM_CONFIG,
  type EventFormConfigData,
} from "@/lib/forms/context-config"
import {
  buildRegistrationFieldRows,
  buildRegistrationSectionRows,
  formatBirthDate,
  formatDietary,
  formatLanguages,
  formatMeetingPreference,
  formatPayment,
  formatSchedule,
  mergeFormConfigs,
} from "@/lib/forms/registration-responses"

/**
 * Registration responses on the registrant detail page — which answers appear,
 * driven by the event's enabled sections and fields.
 *
 *  - unit:      the union rule, the never-hide-a-value rule, value formatting
 *  - edge case: enabled-but-empty, disabled-with-data, all-off, partial values
 */

function cfg(overrides: Partial<EventFormConfigData> = {}): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...overrides }
}

describe("mergeFormConfigs — union across contexts", () => {
  it("is bare when no context enables anything", () => {
    expect(mergeFormConfigs({})).toEqual(BARE_EVENT_FORM_CONFIG)
  })

  it("enables a field that any single context collects", () => {
    const merged = mergeFormConfigs({
      Register: cfg(),
      WalkIn: cfg({ fieldWorkCity: true }),
      CheckIn: cfg(),
    })
    expect(merged.fieldWorkCity).toBe(true)
    expect(merged.fieldGender).toBe(false)
  })

  it("ORs rather than intersecting", () => {
    const merged = mergeFormConfigs({
      Register: cfg({ fieldGender: true }),
      CheckIn: cfg({ fieldLanguage: true }),
    })
    expect(merged.fieldGender).toBe(true)
    expect(merged.fieldLanguage).toBe(true)
  })
})

describe("buildRegistrationFieldRows", () => {
  it("shows nothing when the form asks nothing and nothing was stored", () => {
    expect(buildRegistrationFieldRows(cfg(), {})).toEqual([])
  })

  it("shows an enabled field with no answer, so 'asked and skipped' is visible", () => {
    const rows = buildRegistrationFieldRows(cfg({ fieldWorkCity: true }), {})
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBeNull()
    expect(rows[0].stillCollected).toBe(true)
  })

  it("NEVER hides a stored answer, even once the toggle is off", () => {
    // Turning a toggle off must not make previously-collected data disappear.
    const rows = buildRegistrationFieldRows(cfg(), { fieldWorkCity: "Pasig" })
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe("Pasig")
    expect(rows[0].stillCollected).toBe(false)
  })

  it("marks a stored answer on an enabled field as still collected", () => {
    const rows = buildRegistrationFieldRows(cfg({ fieldWorkCity: true }), {
      fieldWorkCity: "Makati",
    })
    expect(rows[0].stillCollected).toBe(true)
  })

  it("keeps the form's field order", () => {
    const rows = buildRegistrationFieldRows(
      cfg({ fieldLifeStage: true, fieldGender: true, fieldBirthDate: true }),
      {}
    )
    expect(rows.map((r) => r.key)).toEqual([
      "fieldLifeStage",
      "fieldGender",
      "fieldBirthDate",
    ])
  })

  it("labels rows from the shared field metadata", () => {
    const rows = buildRegistrationFieldRows(cfg({ fieldAgeRange: true }), {})
    expect(rows[0].label).toBe("Age Range")
  })
})

describe("buildRegistrationSectionRows", () => {
  it("omits breakout — it has its own section on the page", () => {
    const rows = buildRegistrationSectionRows(
      cfg({ sectionBreakout: true, sectionDietary: true }),
      {}
    )
    expect(rows.map((r) => r.key)).not.toContain("sectionBreakout")
    expect(rows.map((r) => r.key)).toContain("sectionDietary")
  })

  it("shows a stored dietary answer with the section off", () => {
    const rows = buildRegistrationSectionRows(cfg(), { sectionDietary: "Halal" })
    expect(rows).toHaveLength(1)
    expect(rows[0].stillCollected).toBe(false)
  })

  it("shows all four section rows when enabled", () => {
    const rows = buildRegistrationSectionRows(
      cfg({
        sectionSmallGroup: true,
        sectionDietary: true,
        sectionPayment: true,
        sectionFamily: true,
      }),
      {}
    )
    expect(rows).toHaveLength(4)
  })
})

describe("value formatting", () => {
  it("formats a birth month and year, and partials", () => {
    expect(formatBirthDate(3, 1990)).toBe("March 1990")
    expect(formatBirthDate(null, 1990)).toBe("1990")
    expect(formatBirthDate(3, null)).toBe("March")
    expect(formatBirthDate(null, null)).toBeNull()
  })

  it("does not crash on an out-of-range month", () => {
    expect(formatBirthDate(13, 1990)).toBe("13 1990")
  })

  it("humanises meeting preference", () => {
    expect(formatMeetingPreference("InPerson")).toBe("In Person")
    expect(formatMeetingPreference(null)).toBeNull()
    expect(formatMeetingPreference("Unknown")).toBe("Unknown")
  })

  it("joins languages and treats an empty list as no answer", () => {
    expect(formatLanguages(["English", "Tagalog"])).toBe("English, Tagalog")
    expect(formatLanguages([])).toBeNull()
    expect(formatLanguages(null)).toBeNull()
  })

  it("formats a schedule, day-only, and window-only", () => {
    expect(formatSchedule(3, "19:00", "21:00")).toBe("Wednesday, 19:00 – 21:00")
    expect(formatSchedule(0, null, null)).toBe("Sunday")
    expect(formatSchedule(null, "19:00", null)).toBe("19:00")
    expect(formatSchedule(null, null, null)).toBeNull()
  })

  it("formats dietary, expanding Other with the free-text note", () => {
    expect(formatDietary("GlutenFree", null)).toBe("Gluten-Free")
    expect(formatDietary("Other", "No shellfish")).toBe("Other — No shellfish")
    expect(formatDietary("Other", null)).toBe("Other")
    expect(formatDietary(null, "ignored")).toBeNull()
  })

  it("formats payment state with and without a reference", () => {
    expect(formatPayment(true, "GCASH-1")).toBe("Paid — GCASH-1")
    expect(formatPayment(true, null)).toBe("Paid")
    // A reference with isPaid false is a real state — admin entered it, not yet confirmed.
    expect(formatPayment(false, "GCASH-2")).toBe("Unpaid — GCASH-2")
    expect(formatPayment(false, null)).toBeNull()
  })
})
