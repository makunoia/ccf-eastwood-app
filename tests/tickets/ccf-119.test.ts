import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXTS,
  FORM_FIELD_KEYS,
  FORM_SECTION_KEYS,
  FORM_TOGGLE_KEYS,
  FORM_PERSISTED_KEYS,
  IDENTITY_FIELD_KEYS,
  deriveLegacyEventFormConfig,
  type EventFormConfigData,
  type LegacyFormToggles,
} from "@/lib/forms/context-config"
import {
  getEventFormConfig,
  getEventFormConfigs,
} from "@/lib/forms/context-config-server"

/**
 * CCF-119 — per-(event, context) registration form section + field config.
 *
 *  - unit:       bare defaults, toggle-key registry, legacy derivation mapping
 *  - integration: resolver reads rows / falls back to bare, per-context isolation
 *  - regression:  the migration's SQL backfill matches the TS derivation exactly,
 *                 so live events keep their behavior (they must NOT reset to bare)
 *  - edge case:   unknown event, partial rows, cascade on event delete
 */

const MIGRATION_SQL = join(
  process.cwd(),
  "prisma/migrations/20260727000000_add_event_form_config/migration.sql"
)

async function makeEvent(legacy: Partial<LegacyFormToggles> = {}) {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      formIncludeSmallGroup: legacy.formIncludeSmallGroup ?? false,
      formIncludeDietary: legacy.formIncludeDietary ?? false,
      formIncludePayment: legacy.formIncludePayment ?? false,
      autoAssignBreakout: legacy.autoAssignBreakout ?? false,
    },
    select: { id: true },
  })
}

/**
 * Runs the backfill statement lifted verbatim from the migration file. Reading it
 * off disk (rather than restating it) is what makes this a real parity check: if
 * someone edits the SQL mapping without updating deriveLegacyEventFormConfig, this
 * fails.
 */
async function runMigrationBackfill() {
  const sql = readFileSync(MIGRATION_SQL, "utf8")
  const start = sql.indexOf('INSERT INTO "EventFormConfig"')
  expect(start).toBeGreaterThan(-1)
  const statement = sql.slice(start)
  await db.$executeRawUnsafe(statement)
}

/**
 * Narrows a config to the columns *this* migration writes.
 *
 * Without it the parity check compares the whole row against a derivation that
 * has since grown, and fails on `fieldNickname` — which this migration predates
 * and `20260804000000_add_form_field_nickname` backfills a moment later. That
 * intermediate state exists only when the migration is replayed alone, i.e. only
 * here. The committed version of this check parses the column list off disk:
 * tests/integration/form-config-legacy-backfill.test.ts.
 */
const OWNED_KEYS = (() => {
  const sql = readFileSync(MIGRATION_SQL, "utf8")
  const statement = sql.slice(sql.indexOf('INSERT INTO "EventFormConfig"'))
  const columnList = statement.slice(statement.indexOf("(") + 1, statement.indexOf(")"))
  const columns = new Set(columnList.match(/"([^"]+)"/g)?.map((c) => c.slice(1, -1)) ?? [])
  return FORM_PERSISTED_KEYS.filter((key) => columns.has(key))
})()

function ownedOnly(config: EventFormConfigData) {
  return Object.fromEntries(OWNED_KEYS.map((key) => [key, config[key]]))
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-119 unit — toggle registry", () => {
  it("bare config has every toggle off except the identity fields", () => {
    // CCF-142 made mobile and email toggles, defaulting on — they were hardcoded
    // always-on before, so "bare" now means identity-only rather than empty.
    expect(Object.keys(BARE_EVENT_FORM_CONFIG).sort()).toEqual([...FORM_PERSISTED_KEYS].sort())
    for (const key of FORM_TOGGLE_KEYS) {
      expect(BARE_EVENT_FORM_CONFIG[key], key).toBe(
        (IDENTITY_FIELD_KEYS as readonly string[]).includes(key)
      )
    }
  })

  it("covers the five sections and the ticket's eight fields", () => {
    // The field list has grown past the ticket's eight (nickname; then mobile
    // and email when CCF-142 made them configurable), so this asserts the
    // ticket's fields are still *present* rather than that no others exist.
    // Registry shape is pinned properly in tests/unit/form-config-registry.test.ts.
    expect(FORM_SECTION_KEYS).toHaveLength(5)
    for (const key of [
      "fieldLifeStage",
      "fieldGender",
      "fieldBirthDate",
      "fieldAgeRange",
      "fieldWorkCity",
      "fieldLanguage",
      "fieldSchedule",
      "fieldMeetingPreference",
    ]) {
      expect(FORM_FIELD_KEYS as readonly string[], key).toContain(key)
    }
    expect(FORM_CONTEXTS).toEqual(["Register", "WalkIn", "CheckIn"])
  })
})

describe("CCF-119 unit — legacy derivation", () => {
  const allOff: LegacyFormToggles = {
    formIncludeSmallGroup: false,
    formIncludeDietary: false,
    formIncludePayment: false,
    autoAssignBreakout: false,
  }

  it("Register and Walk-in derive identically (same component, same props)", () => {
    const legacy: LegacyFormToggles = {
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
      autoAssignBreakout: false,
    }
    expect(deriveLegacyEventFormConfig(legacy, "Register")).toEqual(
      deriveLegacyEventFormConfig(legacy, "WalkIn")
    )
  })

  it("maps the DGroup toggle onto the matching fields", () => {
    const on = deriveLegacyEventFormConfig(
      { ...allOff, formIncludeSmallGroup: true },
      "Register"
    )
    expect(on.sectionSmallGroup).toBe(true)
    expect(on.fieldLifeStage).toBe(true)
    expect(on.fieldLanguage).toBe(true)
    expect(on.fieldWorkCity).toBe(true)
    expect(on.fieldSchedule).toBe(true)
    expect(on.fieldMeetingPreference).toBe(true)

    const off = deriveLegacyEventFormConfig(allOff, "Register")
    expect(off.sectionSmallGroup).toBe(false)
    expect(off.fieldLifeStage).toBe(false)
    expect(off.fieldMeetingPreference).toBe(false)
  })

  it("keeps birth date + gender on for Register regardless of toggles", () => {
    // Both rendered unconditionally in Personal Information pre-CCF-119.
    const cfg = deriveLegacyEventFormConfig(allOff, "Register")
    expect(cfg.fieldBirthDate).toBe(true)
    expect(cfg.fieldGender).toBe(true)
  })

  it("derives breakout selection as the inverse of auto-assign", () => {
    expect(deriveLegacyEventFormConfig(allOff, "Register").sectionBreakout).toBe(true)
    expect(
      deriveLegacyEventFormConfig({ ...allOff, autoAssignBreakout: true }, "Register")
        .sectionBreakout
    ).toBe(false)
  })

  it("Check-in never derives dietary, payment, breakout, or birth date", () => {
    const cfg = deriveLegacyEventFormConfig(
      {
        formIncludeSmallGroup: true,
        formIncludeDietary: true,
        formIncludePayment: true,
        autoAssignBreakout: false,
      },
      "CheckIn"
    )
    expect(cfg.sectionDietary).toBe(false)
    expect(cfg.sectionPayment).toBe(false)
    expect(cfg.sectionBreakout).toBe(false)
    expect(cfg.fieldBirthDate).toBe(false)
    // The DGroup prompt + matching profile did appear at check-in.
    expect(cfg.sectionSmallGroup).toBe(true)
    expect(cfg.fieldGender).toBe(true)
  })

  it("never derives Age Range or Family — neither existed pre-CCF-119", () => {
    for (const context of FORM_CONTEXTS) {
      const cfg = deriveLegacyEventFormConfig(
        {
          formIncludeSmallGroup: true,
          formIncludeDietary: true,
          formIncludePayment: true,
          autoAssignBreakout: true,
        },
        context
      )
      expect(cfg.fieldAgeRange).toBe(false)
      expect(cfg.sectionFamily).toBe(false)
    }
  })
})

describe("CCF-119 integration — resolver", () => {
  it("returns bare config when no row exists (new events start bare)", async () => {
    const event = await makeEvent({ formIncludeSmallGroup: true, formIncludePayment: true })
    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg).toEqual(BARE_EVENT_FORM_CONFIG)
  })

  it("returns bare config for an event id that does not exist", async () => {
    expect(await getEventFormConfig("does-not-exist", "Register")).toEqual(
      BARE_EVENT_FORM_CONFIG
    )
  })

  it("reads a stored row back", async () => {
    const event = await makeEvent()
    await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        sectionDietary: true,
        fieldLanguage: true,
      },
    })
    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg.sectionDietary).toBe(true)
    expect(cfg.fieldLanguage).toBe(true)
    expect(cfg.sectionPayment).toBe(false)
  })

  it("keeps contexts independent — configuring Register leaves Check-in bare", async () => {
    const event = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", sectionPayment: true },
    })
    const all = await getEventFormConfigs(event.id)
    expect(all.Register.sectionPayment).toBe(true)
    expect(all.WalkIn).toEqual(BARE_EVENT_FORM_CONFIG)
    expect(all.CheckIn).toEqual(BARE_EVENT_FORM_CONFIG)
  })

  it("getEventFormConfigs always returns all three contexts", async () => {
    const event = await makeEvent()
    const all = await getEventFormConfigs(event.id)
    expect(Object.keys(all).sort()).toEqual([...FORM_CONTEXTS].sort())
  })

  it("enforces one row per (event, context)", async () => {
    const event = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register" },
    })
    await expect(
      db.eventFormConfig.create({ data: { eventId: event.id, context: "Register" } })
    ).rejects.toThrow()
  })

  it("cascades when the event is deleted", async () => {
    const event = await makeEvent()
    await db.eventFormConfig.create({ data: { eventId: event.id, context: "Register" } })
    await db.event.delete({ where: { id: event.id } })
    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)
  })
})

describe("CCF-119 regression — migration backfill preserves live behavior", () => {
  const scenarios: { name: string; legacy: LegacyFormToggles }[] = [
    {
      name: "everything off",
      legacy: {
        formIncludeSmallGroup: false,
        formIncludeDietary: false,
        formIncludePayment: false,
        autoAssignBreakout: false,
      },
    },
    {
      name: "everything on",
      legacy: {
        formIncludeSmallGroup: true,
        formIncludeDietary: true,
        formIncludePayment: true,
        autoAssignBreakout: true,
      },
    },
    {
      name: "DGroup only",
      legacy: {
        formIncludeSmallGroup: true,
        formIncludeDietary: false,
        formIncludePayment: false,
        autoAssignBreakout: false,
      },
    },
    {
      name: "paid event, auto-assign on",
      legacy: {
        formIncludeSmallGroup: false,
        formIncludeDietary: false,
        formIncludePayment: true,
        autoAssignBreakout: true,
      },
    },
  ]

  it("the SQL backfill matches deriveLegacyEventFormConfig for every scenario", async () => {
    const ids = new Map<string, LegacyFormToggles>()
    for (const s of scenarios) {
      const event = await makeEvent(s.legacy)
      ids.set(event.id, s.legacy)
    }

    await runMigrationBackfill()

    for (const [eventId, legacy] of ids) {
      const stored = await getEventFormConfigs(eventId)
      for (const context of FORM_CONTEXTS) {
        expect(ownedOnly(stored[context]), `${context} for ${JSON.stringify(legacy)}`).toEqual(
          ownedOnly(deriveLegacyEventFormConfig(legacy, context))
        )
      }
    }
  })

  it("matches the TS derivation for all 16 legacy toggle combinations", async () => {
    // The named scenarios above sample four combinations. Since this migration
    // runs once against live data and a mismatch silently changes what a running
    // event collects, enumerate the whole space rather than trusting a sample.
    const flags = ["formIncludeSmallGroup", "formIncludeDietary", "formIncludePayment", "autoAssignBreakout"] as const
    const combos: LegacyFormToggles[] = []
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      combos.push(
        Object.fromEntries(flags.map((f, i) => [f, (mask & (1 << i)) !== 0])) as LegacyFormToggles
      )
    }
    expect(combos).toHaveLength(16)

    const ids = new Map<string, LegacyFormToggles>()
    for (const legacy of combos) {
      const event = await makeEvent(legacy)
      ids.set(event.id, legacy)
    }

    await runMigrationBackfill()

    for (const [eventId, legacy] of ids) {
      const stored = await getEventFormConfigs(eventId)
      for (const context of FORM_CONTEXTS) {
        expect(ownedOnly(stored[context]), `${context} for ${JSON.stringify(legacy)}`).toEqual(
          ownedOnly(deriveLegacyEventFormConfig(legacy, context))
        )
      }
    }
  })

  it("re-running the whole migration file is safe, not just the backfill", async () => {
    // The idempotency test below re-runs only the INSERT. A retried deploy
    // (P3009/P3018 recovery) re-runs the entire file, DDL included — so the
    // CREATE TABLE / enum / index statements have to survive it too.
    await makeEvent({ formIncludePayment: true })
    const sql = readFileSync(MIGRATION_SQL, "utf8")
    await db.$executeRawUnsafe(sql)
    await db.$executeRawUnsafe(sql)

    const events = await db.event.findMany({ select: { id: true } })
    for (const { id } of events) {
      expect(await db.eventFormConfig.count({ where: { eventId: id } })).toBe(3)
    }
  })

  it("backfills exactly three rows per event and does not reset live events to bare", async () => {
    const event = await makeEvent({ formIncludeSmallGroup: true, formIncludeDietary: true })
    await runMigrationBackfill()

    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(3)
    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg).not.toEqual(BARE_EVENT_FORM_CONFIG)
    expect(cfg.sectionSmallGroup).toBe(true)
    expect(cfg.sectionDietary).toBe(true)
  })

  it("is idempotent — re-running the backfill creates no duplicates and preserves edits", async () => {
    const event = await makeEvent({ formIncludeSmallGroup: true })
    await runMigrationBackfill()

    // An admin then turns the DGroup section off.
    await db.eventFormConfig.update({
      where: { eventId_context: { eventId: event.id, context: "Register" } },
      data: { sectionSmallGroup: false },
    })

    await runMigrationBackfill()

    expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(3)
    const cfg = await getEventFormConfig(event.id, "Register")
    expect(cfg.sectionSmallGroup).toBe(false)
  })
})

describe("CCF-119 edge case — partial rows", () => {
  it("treats missing columns on a sparse row as off", async () => {
    const event = await makeEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "WalkIn", fieldGender: true },
    })
    const cfg: EventFormConfigData = await getEventFormConfig(event.id, "WalkIn")
    expect(cfg.fieldGender).toBe(true)
    // An unset column falls back to FORM_TOGGLE_DEFAULTS, which is `false` for
    // everything but mobile and email (CCF-142).
    const others = FORM_TOGGLE_KEYS.filter((k) => k !== "fieldGender")
    for (const key of others) {
      expect(cfg[key], key).toBe((IDENTITY_FIELD_KEYS as readonly string[]).includes(key))
    }
  })
})
