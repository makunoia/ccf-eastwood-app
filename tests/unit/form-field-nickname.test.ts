/**
 * Nickname as a configurable registration form field.
 *
 * The nickname input used to render unconditionally on the Register / Walk-in
 * form, with no way for an admin to drop it. It is now an ordinary field toggle,
 * which brings three obligations these tests pin:
 *
 *  - unit:       it is a real toggle — listed, labelled, laid out, and gating a
 *                payload field rather than being decorative
 *  - edge case:  a crafted POST can't store a nickname the admin turned off, and
 *                a turned-off toggle never hides an answer already collected
 *  - regression: the public form reads the toggle instead of always rendering,
 *                and the migration backfills every event that exists today so no
 *                live form silently loses the field
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_FIELD_KEYS,
  FORM_FIELD_META,
  deriveLegacyEventFormConfig,
  formLayoutFor,
  parentSectionFor,
} from "@/lib/forms/context-config"
import {
  REGISTRANT_FIELD_GATES,
  fieldKeysWithoutGate,
  sanitizeHouseholdMember,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import { buildRegistrationFieldRows } from "@/lib/forms/registration-responses"
import { registrantSchema } from "@/lib/validations/event-registrant"

const legacy = {
  formIncludeSmallGroup: false,
  formIncludeDietary: false,
  formIncludePayment: false,
  autoAssignBreakout: false,
}

describe("nickname — a first-class field toggle", () => {
  it("is one of the configurable fields, with builder metadata", () => {
    expect(FORM_FIELD_KEYS).toContain("fieldNickname")
    expect(FORM_FIELD_META.fieldNickname.label).toBe("Nickname")
    expect(FORM_FIELD_META.fieldNickname.description).not.toBe("")
  })

  it("sits in the always-on identity step, not nested under DGroup", () => {
    const personal = formLayoutFor("Register").find((s) => s.key === "personal")
    expect(personal?.fields).toContain("fieldNickname")
    expect(parentSectionFor("fieldNickname", "Register")).toBeNull()
  })

  it("is asked before the demographics, matching the form's own order", () => {
    const personal = formLayoutFor("Register").find((s) => s.key === "personal")
    // The input renders directly under First/Last name and above Life Stage.
    expect(personal?.fields[0]).toBe("fieldNickname")
  })

  it("is absent from the check-in layout — that surface identifies, it doesn't collect", () => {
    for (const section of formLayoutFor("CheckIn")) {
      expect(section.fields).not.toContain("fieldNickname")
    }
  })

  it("gates a real payload field rather than being decorative", () => {
    expect(REGISTRANT_FIELD_GATES.nickname).toBe("fieldNickname")
    expect(fieldKeysWithoutGate()).not.toContain("fieldNickname")
  })

  it("is off in the bare config, like every other optional field", () => {
    expect(BARE_EVENT_FORM_CONFIG.fieldNickname).toBe(false)
  })
})

describe("nickname — server-side enforcement", () => {
  it("drops a crafted nickname when the field is off", () => {
    const sanitized = sanitizeRegistrantPayload(BARE_EVENT_FORM_CONFIG, {
      nickname: "Jun",
    })
    expect(sanitized.nickname).toBeNull()
  })

  it("keeps the nickname when the field is on", () => {
    const sanitized = sanitizeRegistrantPayload(
      { ...BARE_EVENT_FORM_CONFIG, fieldNickname: true },
      { nickname: "Jun" }
    )
    expect(sanitized.nickname).toBe("Jun")
  })

  it("leaves the field absent rather than inventing a null", () => {
    // Nothing submitted stays nothing submitted — the write paths only fill
    // what's currently empty, and an injected null would look like an answer.
    expect("nickname" in sanitizeRegistrantPayload(BARE_EVENT_FORM_CONFIG, {})).toBe(false)
  })

  it("carries the same gate onto household members", () => {
    expect(
      sanitizeHouseholdMember(BARE_EVENT_FORM_CONFIG, { nickname: "Toto" }).nickname
    ).toBeNull()
    expect(
      sanitizeHouseholdMember(
        { ...BARE_EVENT_FORM_CONFIG, fieldNickname: true },
        { nickname: "Toto" }
      ).nickname
    ).toBe("Toto")
  })

  it("survives the payload schema once sanitized", () => {
    const sanitized = sanitizeRegistrantPayload(
      { ...BARE_EVENT_FORM_CONFIG, fieldNickname: true },
      { nickname: "  Jun  " }
    )
    const parsed = registrantSchema.parse({
      firstName: "Junior",
      lastName: "Santos",
      ...sanitized,
    })
    expect(parsed.nickname).toBe("Jun")
  })
})

describe("nickname — on the registrant detail page", () => {
  it("shows the answer as a response row when the field is asked", () => {
    const rows = buildRegistrationFieldRows(
      { ...BARE_EVENT_FORM_CONFIG, fieldNickname: true },
      { fieldNickname: "Jun" }
    )
    expect(rows[0]).toMatchObject({
      key: "fieldNickname",
      label: "Nickname",
      value: "Jun",
      stillCollected: true,
    })
  })

  it("never hides a nickname collected before the field was turned off", () => {
    const rows = buildRegistrationFieldRows(BARE_EVENT_FORM_CONFIG, {
      fieldNickname: "Jun",
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe("Jun")
    expect(rows[0].stillCollected).toBe(false)
  })

  it("says nothing when the field is off and nothing was stored", () => {
    expect(buildRegistrationFieldRows(BARE_EVENT_FORM_CONFIG, {})).toEqual([])
  })
})

describe("nickname — no live form loses the field", () => {
  it("derives as on for Register and Walk-in, off for Check-in", () => {
    // The pre-toggle behavior: rendered unconditionally on the registration
    // form, never present on the check-in profile step.
    expect(deriveLegacyEventFormConfig(legacy, "Register").fieldNickname).toBe(true)
    expect(deriveLegacyEventFormConfig(legacy, "WalkIn").fieldNickname).toBe(true)
    expect(deriveLegacyEventFormConfig(legacy, "CheckIn").fieldNickname).toBe(false)
  })

  it("backfills stored configs and creates rows for events that had none", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260804000000_add_form_field_nickname/migration.sql"
      ),
      "utf8"
    )
    // Configured events keep asking; bare events need a row to say the same.
    expect(sql).toContain(`SET "fieldNickname" = true`)
    expect(sql).toContain(`WHERE "context" IN ('Register', 'WalkIn')`)
    expect(sql).toContain(`ON CONFLICT ("eventId", "context") DO NOTHING`)
    expect(sql).toContain(`ON CONFLICT ("clusterId", "context") DO NOTHING`)
    // Re-running after a partial failure must not resurrect a toggle an admin
    // has since switched off, so the backfill only runs when the column is new.
    expect(sql).toContain("IF NOT EXISTS (")
    expect(sql).toContain("information_schema.columns")
  })
})

describe("nickname — the surfaces read the toggle", () => {
  const form = readFileSync(
    join(process.cwd(), "app/events/[id]/register/registration-form.tsx"),
    "utf8"
  )

  it("renders the input only when the field is on", () => {
    expect(form).toContain("{cfg.fieldNickname && (")
    // The label carries a `*` marker since CCF-142, so match the field rather
    // than the whole element.
    expect(form).toMatch(/<Label htmlFor="nickname">\s*Nickname/)
  })

  it("withholds the value on submit when the field is off", () => {
    // A value seeded into state (e.g. carried over from a member match) must not
    // ride along on a form that no longer asks the question.
    expect(form).toContain("nickname: cfg.fieldNickname ? form.nickname : null")
  })

  it("is hidden in the builder's Check-in tab", () => {
    const builder = readFileSync(
      join(process.cwd(), "components/forms/event-form-builder.tsx"),
      "utf8"
    )
    // The list grew in CCF-142 (mobile and email are check-in-inapplicable too),
    // so assert membership rather than the exact literal.
    const checkInNotApplicable = /NOT_APPLICABLE[\s\S]*?CheckIn:\s*\[([\s\S]*?)\]/.exec(builder)
    expect(checkInNotApplicable).not.toBeNull()
    expect(checkInNotApplicable![1]).toContain(`"fieldNickname"`)
  })
})
