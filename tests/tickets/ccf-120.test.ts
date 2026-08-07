import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import {
  saveEventFormConfig,
  setEventFormToggle,
  copyEventFormConfig,
} from "@/app/(dashboard)/events/form-config-actions"
import {
  getEventFormConfig,
  getEventFormConfigs,
} from "@/lib/forms/context-config-server"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXTS,
  FORM_FIELD_KEYS,
  FORM_SECTION_KEYS,
  FORM_TOGGLE_KEYS,
  deriveLegacyEventFormConfig,
  formLayoutFor,
  parentSectionFor,
} from "@/lib/forms/context-config"

/**
 * CCF-120 — registration form builder actions.
 *
 *  - integration: upsert per (event, context), single-toggle flips, copy between contexts
 *  - edge case:   unknown event / context / toggle key, partial updates, empty payload
 *  - regression:  writing one context must not touch the others, and a partial
 *                 write must not clear toggles it did not mention
 */

async function makeEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
    },
    select: { id: true },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-120 — saveEventFormConfig", () => {
  it("creates the row on first write (bare events have no row yet)", async () => {
    const event = await makeEvent()
    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)

    const result = await saveEventFormConfig(event.id, "Register", {
      sectionDietary: true,
      fieldLanguage: true,
    })
    expect(result.success).toBe(true)

    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg.sectionDietary).toBe(true)
    expect(cfg.fieldLanguage).toBe(true)
    expect(cfg.sectionPayment).toBe(false)
  })

  it("upserts rather than duplicating on a second write", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    await saveEventFormConfig(event.id, "Register", { sectionPayment: true })

    const rows = await db.eventFormConfig.findMany({
      where: { eventId: event.id, context: "Register" },
    })
    expect(rows).toHaveLength(1)
  })

  it("leaves unmentioned toggles untouched (partial update)", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", {
      sectionDietary: true,
      fieldGender: true,
    })
    await saveEventFormConfig(event.id, "Register", { sectionPayment: true })

    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg.sectionDietary).toBe(true)
    expect(cfg.fieldGender).toBe(true)
    expect(cfg.sectionPayment).toBe(true)
  })

  it("can turn a toggle back off", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    await saveEventFormConfig(event.id, "Register", { sectionDietary: false })
    expect((await getEventFormConfig(event.id, "Register")).sectionDietary).toBe(false)
  })

  it("writes only the named context", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "WalkIn", { sectionPayment: true })

    const all = await getEventFormConfigs(event.id)
    expect(all.WalkIn.sectionPayment).toBe(true)
    expect(all.Register).toEqual(BARE_EVENT_FORM_CONFIG)
    expect(all.CheckIn).toEqual(BARE_EVENT_FORM_CONFIG)
  })

  it("rejects an unknown event", async () => {
    const result = await saveEventFormConfig("nope", "Register", { sectionDietary: true })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/not found/i)
  })

  it("rejects an unknown context", async () => {
    const event = await makeEvent()
    const result = await saveEventFormConfig(
      event.id,
      "Nonsense" as unknown as "Register",
      { sectionDietary: true }
    )
    expect(result.success).toBe(false)
  })

  it("rejects unknown toggle keys instead of silently dropping them", async () => {
    const event = await makeEvent()
    const result = await saveEventFormConfig(event.id, "Register", {
      sectionDietary: true,
      dropTables: true,
    } as unknown as { sectionDietary: boolean })
    expect(result.success).toBe(false)
  })

  it("accepts an empty payload as a no-op that still creates a bare row", async () => {
    const event = await makeEvent()
    const result = await saveEventFormConfig(event.id, "Register", {})
    expect(result.success).toBe(true)
    expect(await getEventFormConfig(event.id, "Register")).toEqual(BARE_EVENT_FORM_CONFIG)
  })
})

describe("CCF-120 — setEventFormToggle", () => {
  it("flips a single toggle", async () => {
    const event = await makeEvent()
    expect((await setEventFormToggle(event.id, "CheckIn", "fieldGender", true)).success).toBe(
      true
    )
    expect((await getEventFormConfig(event.id, "CheckIn")).fieldGender).toBe(true)

    await setEventFormToggle(event.id, "CheckIn", "fieldGender", false)
    expect((await getEventFormConfig(event.id, "CheckIn")).fieldGender).toBe(false)
  })

  it("supports every registered toggle key", async () => {
    const event = await makeEvent()
    for (const key of FORM_TOGGLE_KEYS) {
      const result = await setEventFormToggle(event.id, "Register", key, true)
      expect(result.success, key).toBe(true)
    }
    const cfg = await getEventFormConfig(event.id, "Register")
    for (const key of FORM_TOGGLE_KEYS) {
      expect(cfg[key], key).toBe(true)
    }
  })

  it("rejects an unknown toggle key", async () => {
    const event = await makeEvent()
    const result = await setEventFormToggle(
      event.id,
      "Register",
      "fieldTelepathy" as unknown as "fieldGender",
      true
    )
    expect(result.success).toBe(false)
  })
})

describe("CCF-120 — copyEventFormConfig", () => {
  it("copies Register onto Walk-in", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", {
      sectionSmallGroup: true,
      sectionDietary: true,
      fieldLanguage: true,
    })

    const result = await copyEventFormConfig(event.id, "Register", "WalkIn")
    expect(result.success).toBe(true)

    const all = await getEventFormConfigs(event.id)
    expect(all.WalkIn).toEqual(all.Register)
  })

  it("overwrites the target's existing toggles", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    await saveEventFormConfig(event.id, "WalkIn", { sectionPayment: true })

    await copyEventFormConfig(event.id, "Register", "WalkIn")

    const walkIn = await getEventFormConfig(event.id, "WalkIn")
    expect(walkIn.sectionDietary).toBe(true)
    expect(walkIn.sectionPayment).toBe(false)
  })

  it("copying a bare source clears the target", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "WalkIn", { sectionPayment: true, fieldGender: true })

    await copyEventFormConfig(event.id, "Register", "WalkIn")

    expect(await getEventFormConfig(event.id, "WalkIn")).toEqual(BARE_EVENT_FORM_CONFIG)
  })

  it("refuses to copy a context onto itself", async () => {
    const event = await makeEvent()
    const result = await copyEventFormConfig(event.id, "Register", "Register")
    expect(result.success).toBe(false)
  })
})

describe("CCF-120 — permissions", () => {
  it("refuses to write without Events write permission", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "staff", role: "Staff", permissions: [], eventAccess: [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const result = await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    expect(result.success).toBe(false)
    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("refuses to write when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth")
    const event = await makeEvent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)

    const result = await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    expect(result.success).toBe(false)
    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)
  })
})

describe("CCF-120 regression — a migrated event stays configurable", () => {
  it("an admin edit on top of backfilled values persists per context", async () => {
    const event = await db.event.create({
      data: {
        name: "Legacy Event",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        formIncludeSmallGroup: true,
        formIncludeDietary: true,
      },
      select: { id: true },
    })

    // Stand in for the migration's backfill.
    const legacy = {
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: false,
      autoAssignBreakout: false,
    }
    for (const context of ["Register", "WalkIn", "CheckIn"] as const) {
      await db.eventFormConfig.create({
        data: { eventId: event.id, context, ...deriveLegacyEventFormConfig(legacy, context) },
      })
    }

    // Admin turns dietary off for walk-ins only.
    await setEventFormToggle(event.id, "WalkIn", "sectionDietary", false)

    const all = await getEventFormConfigs(event.id)
    expect(all.WalkIn.sectionDietary).toBe(false)
    expect(all.Register.sectionDietary).toBe(true)
    expect(all.Register.sectionSmallGroup).toBe(true)
    expect(all.CheckIn.sectionSmallGroup).toBe(true)
  })
})

describe("CCF-120 — the public surfaces honor the config", () => {
  /**
   * The AC is "public register/walk-in/check-in forms must honor the config
   * (replaces the implicit breakout gate)". The forms themselves are client
   * components and this suite has no DOM, so what is asserted here is the server
   * half: each public page resolves the *right* context and reduces the option
   * lists it hands down. That is where a silent regression would actually land —
   * a page that stops calling the resolver would render an unconfigured form.
   */
  // CCF-133 split walk-in onto its own route, so Register and WalkIn are now two
  // entry points resolving one context each rather than one page branching.
  const PUBLIC_PAGES: { file: string; context: string }[] = [
    { file: "app/events/[id]/register/page.tsx", context: `"Register"` },
    { file: "app/events/[id]/walk-in/page.tsx", context: `"WalkIn"` },
    { file: "app/events/[id]/checkin/page.tsx", context: `"CheckIn"` },
    { file: "app/events/[id]/checkin/[occurrenceId]/page.tsx", context: `"CheckIn"` },
  ]

  it("every public entry point resolves its own context's config", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")

    for (const { file, context } of PUBLIC_PAGES) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      expect(
        source.includes("getEffectiveFormConfig"),
        `${file} must resolve the form config`
      ).toBe(true)
      expect(
        source.includes(context),
        `${file} must resolve the ${context} context specifically`
      ).toBe(true)
      // Config is passed into the form, not just fetched and dropped.
      expect(source.includes("config={"), `${file} must pass the config to its form`).toBe(true)
    }
  })

  it("the breakout picker is gated on the config, not just on candidates existing", async () => {
    // Pre-CCF-120 the section appeared implicitly whenever any breakout group
    // existed. The config gate must come first; `candidates.length > 0` survives
    // only as a secondary "nothing to pick" guard.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const source = readFileSync(join(process.cwd(), "app/events/[id]/register/page.tsx"), "utf8")

    expect(source).toContain("formFields.sectionBreakout")
    // With the section off, no candidates are fetched at all — so the client's
    // `candidates.length > 0` check cannot resurrect the section.
    expect(source).toContain("!offerBreakoutPicker")
  })

  it("hands down no options for a field the context has turned off", async () => {
    // Guards against a page fetching every LifeStage / AgeRangeBucket regardless
    // of config: an off field must arrive at the client with an empty list, so a
    // tampered client cannot present choices the admin disabled.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")

    for (const { file } of PUBLIC_PAGES) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      expect(source.includes("fieldLifeStage"), `${file} must gate the life-stage list`).toBe(true)
      expect(source.includes("fieldAgeRange"), `${file} must gate the age-range list`).toBe(true)
    }
  })
})

describe("CCF-120 — the builder is grouped by the form's own sections", () => {
  /**
   * The builder used to show a flat list of sections beside a flat list of fields,
   * which told an admin nothing about where a field appears. Most fields only
   * render inside one particular step: five of the eight live in the DGroup step
   * on Register/Walk-in, and Check-in has a different shape entirely.
   *
   * `formLayoutFor()` is now the single source of truth for that grouping. These
   * tests pin it against what the forms actually render, read off disk — so moving
   * a field between steps without updating the layout fails here rather than
   * shipping a builder that misdescribes the form.
   */
  const REGISTER_FORM = "app/events/[id]/register/registration-form.tsx"
  const CHECKIN_FORM = "app/events/[id]/checkin/checkin-board.tsx"

  function read(file: string): string {
    return readFileSync(join(process.cwd(), file), "utf8")
  }

  it("lists Personal Information first and never lets it be switched off", () => {
    for (const context of FORM_CONTEXTS) {
      const layout = formLayoutFor(context)
      expect(layout[0].key, context).toBe("personal")
      // "personal" is deliberately not a FormSectionKey — there is no column for it.
      expect(FORM_SECTION_KEYS).not.toContain("personal")
    }
  })

  it("places every field in exactly one section per context", () => {
    for (const context of FORM_CONTEXTS) {
      const placed = formLayoutFor(context).flatMap((s) => s.fields)
      expect(new Set(placed).size, `${context} lists a field twice`).toBe(placed.length)
    }
  })

  it("only references sections that exist as real toggles", () => {
    for (const context of FORM_CONTEXTS) {
      for (const section of formLayoutFor(context)) {
        if (section.key === "personal") continue
        expect(FORM_SECTION_KEYS, `${context}/${section.key}`).toContain(section.key)
      }
    }
  })

  it("mirrors the register form's step order", () => {
    // The builder should read top-to-bottom like the form does.
    const source = read(REGISTER_FORM)
    const order = ["personal", "smallgroup", "breakout", "household", "dietary", "payment"]
    let cursor = -1
    for (const key of order) {
      const at = source.indexOf(`key: "${key}"`)
      expect(at, `${key} missing from the form's sections array`).toBeGreaterThan(-1)
      expect(at, `${key} out of order`).toBeGreaterThan(cursor)
      cursor = at
    }
    expect(formLayoutFor("Register").map((s) => s.key)).toEqual([
      "personal",
      "sectionSmallGroup",
      "sectionBreakout",
      "sectionFamily",
      "sectionDietary",
      "sectionPayment",
    ])
  })

  it("puts the matching fields under the DGroup step on Register and Walk-in", () => {
    // Life Stage is deliberately NOT here — see the test below.
    const matching = [
      "fieldLanguage",
      "fieldMeetingPreference",
      "fieldSchedule",
      "fieldWorkCity",
    ] as const
    for (const context of ["Register", "WalkIn"] as const) {
      const dgroup = formLayoutFor(context).find((s) => s.key === "sectionSmallGroup")
      expect([...(dgroup?.fields ?? [])].sort()).toEqual([...matching].sort())
      for (const field of matching) {
        expect(parentSectionFor(field, context), field).toBe("sectionSmallGroup")
      }
    }
  })

  it("asks Life Stage in Personal Information, not inside the DGroup step", () => {
    // It describes the person and ministries are scoped by it, so it's worth asking
    // whether or not they want a group. Being in Personal Information means it no
    // longer depends on the DGroup section or on the "wants to join" answer — which
    // is what made it look like a broken toggle before.
    for (const context of FORM_CONTEXTS) {
      const personal = formLayoutFor(context).find((s) => s.key === "personal")
      expect(personal?.fields, context).toContain("fieldLifeStage")
      expect(parentSectionFor("fieldLifeStage", context), context).toBeNull()

      const dgroup = formLayoutFor(context).find((s) => s.key === "sectionSmallGroup")
      expect(dgroup?.fields ?? [], context).not.toContain("fieldLifeStage")
    }
  })

  it("submits Life Stage without requiring the DGroup step", () => {
    // The client gated the payload on `includeMatching && cfg.fieldLifeStage`, which
    // would have silently dropped the answer now that the input sits earlier in the
    // form. Read off disk so the gate can't regress to the coupled version.
    const source = read(REGISTER_FORM)
    expect(source).toContain("lifeStageId: cfg.fieldLifeStage ? form.lifeStageId || null : null")
    expect(source).not.toContain("includeMatching && cfg.fieldLifeStage")
  })

  it("keeps Check-in flat — its profile step has no DGroup dependency", () => {
    const dgroup = formLayoutFor("CheckIn").find((s) => s.key === "sectionSmallGroup")
    expect(dgroup?.fields).toEqual([])
    for (const field of FORM_FIELD_KEYS) {
      expect(parentSectionFor(field, "CheckIn"), field).toBeNull()
    }
  })

  it("does not claim Check-in collects birth date — the form has no such input", () => {
    // Found while regrouping the builder: `fieldBirthDate` was offered on the
    // Check-in tab but checkin-board.tsx never renders a birth date input, so the
    // toggle could not do anything at all.
    const source = read(CHECKIN_FORM)
    expect(source).not.toMatch(/birthMonth|birthYear/)

    const checkinFields = formLayoutFor("CheckIn").flatMap((s) => s.fields)
    expect(checkinFields).not.toContain("fieldBirthDate")
  })

  it("lists exactly the fields the check-in profile step renders", () => {
    const source = read(CHECKIN_FORM)
    const rendered = FORM_FIELD_KEYS.filter((k) => source.includes(`cfg.${k}`))
    const listed = formLayoutFor("CheckIn").flatMap((s) => s.fields)
    expect([...listed].sort()).toEqual([...rendered].sort())
  })

  it("lists exactly the fields the register form renders", () => {
    const source = read(REGISTER_FORM)
    const rendered = FORM_FIELD_KEYS.filter((k) => source.includes(`cfg.${k}`))
    const listed = formLayoutFor("Register").flatMap((s) => s.fields)
    expect([...listed].sort()).toEqual([...rendered].sort())
  })

  it("hangs the spouse-only option off the Family section in every context", () => {
    for (const context of FORM_CONTEXTS) {
      const family = formLayoutFor(context).find((s) => s.key === "sectionFamily")
      expect(family?.options, context).toContain("familySpouseOnly")
    }
  })

  it("still persists a nested field's toggle like any other", async () => {
    // Grouping is presentation only — the column and the write path are unchanged.
    const event = await makeEvent()
    const res = await setEventFormToggle(event.id, "Register", "fieldLifeStage", true)
    expect(res.success).toBe(true)
    expect((await getEventFormConfig(event.id, "Register")).fieldLifeStage).toBe(true)
  })
})

describe("CCF-120 — Walk-in can copy Register", () => {
  /**
   * Surfaced on Mark's request: walk-ins almost always want Register's shape as a
   * starting point (they render the same component), then a tweak or two. The
   * action already existed and was tested — it just had no UI.
   *
   * Deliberately a one-shot copy, not a live binding: a persistent mirror would
   * silently rewrite the Walk-in tab whenever Register changed.
   */
  it("makes every toggle identical, options included", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", {
      sectionSmallGroup: true,
      sectionFamily: true,
      familySpouseOnly: true,
      fieldLifeStage: true,
      fieldAgeRange: true,
    })

    expect((await copyEventFormConfig(event.id, "Register", "WalkIn")).success).toBe(true)

    const all = await getEventFormConfigs(event.id)
    for (const key of FORM_TOGGLE_KEYS) {
      expect(all.WalkIn[key], key).toBe(all.Register[key])
    }
  })

  it("leaves Check-in alone — it is configured on its own page now", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", { sectionPayment: true })
    await saveEventFormConfig(event.id, "CheckIn", { fieldGender: true })

    await copyEventFormConfig(event.id, "Register", "WalkIn")

    const all = await getEventFormConfigs(event.id)
    expect(all.CheckIn.fieldGender).toBe(true)
    expect(all.CheckIn.sectionPayment).toBe(false)
  })

  it("is repeatable and stays in sync after a second copy", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", { sectionDietary: true })
    await copyEventFormConfig(event.id, "Register", "WalkIn")

    // Register changes; Walk-in drifts until copied again — the copy is one-shot.
    await saveEventFormConfig(event.id, "Register", { sectionPayment: true })
    let all = await getEventFormConfigs(event.id)
    expect(all.WalkIn.sectionPayment).toBe(false)

    await copyEventFormConfig(event.id, "Register", "WalkIn")
    all = await getEventFormConfigs(event.id)
    expect(all.WalkIn.sectionPayment).toBe(true)
    expect(all.WalkIn.sectionDietary).toBe(true)
  })

  it("can be diverged afterwards without touching Register", async () => {
    const event = await makeEvent()
    await saveEventFormConfig(event.id, "Register", {
      sectionDietary: true,
      sectionPayment: true,
    })
    await copyEventFormConfig(event.id, "Register", "WalkIn")

    // The usual reason to diverge: no payment at the door.
    await setEventFormToggle(event.id, "WalkIn", "sectionPayment", false)

    const all = await getEventFormConfigs(event.id)
    expect(all.WalkIn.sectionPayment).toBe(false)
    expect(all.Register.sectionPayment).toBe(true)
    expect(all.WalkIn.sectionDietary).toBe(true)
  })
})
