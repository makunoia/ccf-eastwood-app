import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import {
  FORM_CONTEXTS,
  FORM_PERSISTED_KEYS,
  deriveLegacyEventFormConfig,
  type LegacyFormToggles,
} from "@/lib/forms/context-config"
import { getEventFormConfigs } from "@/lib/forms/context-config-server"

/**
 * CCF-119's backfill has to reproduce `deriveLegacyEventFormConfig` exactly, or
 * every event that existed at migration time silently resets to a bare form.
 *
 * Promoted out of the gitignored `tests/tickets/` so it runs in CI. It kept the
 * original's good idea — read the SQL off disk rather than restate it, so
 * editing the mapping without updating the TS derivation fails here — and drops
 * the bad one: comparing *every* column against a derivation that has since
 * grown.
 *
 * That comparison was failing on `fieldNickname`, which looked like the
 * migration and the derivation disagreeing. They don't. This migration predates
 * the column, so replaying it alone leaves the column default; in a real
 * database `20260804000000_add_form_field_nickname` runs straight afterwards and
 * sets it. The test was the only place that intermediate state ever existed.
 *
 * So the parity check is scoped to the columns this migration actually writes,
 * parsed from its own INSERT. A later migration adding a column no longer breaks
 * it — and a later migration that *changes this one's mapping* still does.
 */

const MIGRATION_SQL = join(
  process.cwd(),
  "prisma/migrations/20260727000000_add_event_form_config/migration.sql"
)

const sql = readFileSync(MIGRATION_SQL, "utf8")

/** The backfill statement, lifted verbatim. */
const backfillStatement = (() => {
  const start = sql.indexOf('INSERT INTO "EventFormConfig"')
  if (start < 0) throw new Error("CCF-119 backfill INSERT not found — did the migration move?")
  return sql.slice(start)
})()

/**
 * The config columns this migration writes, read out of the INSERT's own column
 * list. Bookkeeping columns (id/eventId/context/timestamps) drop out because
 * they aren't in the toggle registry.
 */
const ownedKeys = (() => {
  const columnList = backfillStatement.slice(
    backfillStatement.indexOf("(") + 1,
    backfillStatement.indexOf(")")
  )
  const columns = new Set(columnList.match(/"([^"]+)"/g)?.map((c) => c.slice(1, -1)) ?? [])
  return FORM_PERSISTED_KEYS.filter((key) => columns.has(key))
})()

async function makeEvent(legacy: LegacyFormToggles) {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      ...legacy,
    },
    select: { id: true },
  })
}

async function runMigrationBackfill() {
  await db.$executeRawUnsafe(backfillStatement)
}

/** Every combination of the four legacy toggles — 16 of them. */
const allCombinations: LegacyFormToggles[] = Array.from({ length: 16 }, (_, mask) => ({
  formIncludeSmallGroup: !!(mask & 1),
  formIncludeDietary: !!(mask & 2),
  formIncludePayment: !!(mask & 4),
  autoAssignBreakout: !!(mask & 8),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("the CCF-119 backfill reproduces the TS derivation", () => {
  it("writes the columns the derivation covers", () => {
    // Guards the parse above: if the INSERT's column list were misread, every
    // parity assertion below would compare an empty set and pass vacuously.
    expect(ownedKeys.length).toBeGreaterThan(0)
    expect(ownedKeys).toContain("sectionSmallGroup")
    expect(ownedKeys).toContain("fieldLifeStage")
  })

  it("matches for all 16 legacy toggle combinations, in every context", async () => {
    const seeded = new Map<string, LegacyFormToggles>()
    for (const legacy of allCombinations) {
      const event = await makeEvent(legacy)
      seeded.set(event.id, legacy)
    }

    await runMigrationBackfill()

    for (const [eventId, legacy] of seeded) {
      const stored = await getEventFormConfigs(eventId)
      for (const context of FORM_CONTEXTS) {
        const expected = deriveLegacyEventFormConfig(legacy, context)
        for (const key of ownedKeys) {
          expect(
            stored[context][key],
            `${key} in ${context} for ${JSON.stringify(legacy)}`
          ).toBe(expected[key])
        }
      }
    }
  })

  it("writes a row for every context, so no event falls back to bare", async () => {
    const event = await makeEvent(allCombinations[0])
    await runMigrationBackfill()

    const stored = await getEventFormConfigs(event.id)
    for (const context of FORM_CONTEXTS) {
      expect(stored[context], context).toBeTruthy()
    }
  })

  it("leaves an event created after the migration alone", async () => {
    // The backfill is one-shot history. Re-running it must not touch an event
    // that already has rows, or a re-deploy would stamp on admin edits.
    const event = await makeEvent(allCombinations[0])
    await runMigrationBackfill()
    await db.eventFormConfig.updateMany({
      where: { eventId: event.id },
      data: { sectionDietary: true },
    })

    await runMigrationBackfill()

    const stored = await getEventFormConfigs(event.id)
    expect(stored.Register.sectionDietary).toBe(true)
  })
})

describe("columns this migration does not own", () => {
  it("are backfilled by their own later migration, not this one", () => {
    // fieldNickname is the worked example: added by
    // 20260804000000_add_form_field_nickname, which sets it true for the
    // Register and WalkIn rows of every event that already existed. Comparing it
    // against this migration's output is comparing against a state no real
    // database is ever in — that mistake is what made this suite red for weeks.
    expect(ownedKeys).not.toContain("fieldNickname")
    expect(deriveLegacyEventFormConfig(allCombinations[0], "Register").fieldNickname).toBe(true)

    const nicknameMigration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260804000000_add_form_field_nickname/migration.sql"
      ),
      "utf8"
    )
    expect(nicknameMigration).toContain('SET "fieldNickname" = true')
  })
})
