import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import { ADMIN_INTENT_TOGGLE_KEYS } from "@/lib/forms/context-config"

/**
 * `20260808000000_form_config_configured_at` has one job beyond adding a column:
 * stamp the rows that already read as configured, so nobody's checklist step
 * un-ticks on deploy.
 *
 * The stamp replaces a TS predicate (ADMIN_INTENT_TOGGLE_KEYS, or a worded
 * success message) with a hand-written SQL column list. Two lists that have to
 * agree and live in different languages is exactly the drift that made the
 * CCF-119 backfill parity check worth having — so this pins both halves: the
 * SQL names every key the TS list does, and re-running is a no-op.
 */

const MIGRATION_SQL = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260808000000_form_config_configured_at/migration.sql"
  ),
  "utf8"
)

/** The backfill UPDATE, without the ALTER that precedes it. */
const backfillStatement = MIGRATION_SQL.slice(MIGRATION_SQL.indexOf('UPDATE "EventFormConfig"'))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Camp", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

/** A row as a migration would leave it — no stamp. */
async function seedUnstampedConfig(eventId: string, data: Record<string, unknown> = {}) {
  return db.eventFormConfig.create({
    data: { eventId, context: "Register", configuredAt: null, ...data },
  })
}

async function runBackfill() {
  await db.$executeRawUnsafe(backfillStatement)
}

async function stampOf(id: string) {
  const row = await db.eventFormConfig.findUnique({
    where: { id },
    select: { configuredAt: true },
  })
  return row?.configuredAt ?? null
}

describe("the SQL column list matches ADMIN_INTENT_TOGGLE_KEYS", () => {
  it("names every key the TS predicate uses", () => {
    // The check that stops the two drifting. A key added to the TS list but not
    // to the migration would leave those rows unstamped on deploy.
    for (const key of ADMIN_INTENT_TOGGLE_KEYS) {
      expect(backfillStatement, key).toContain(`"${key}"`)
    }
  })

  it("does not name the toggles that arrive on without an admin", () => {
    // fieldNickname is migration-written; mobile and email default true. Any of
    // them in the list would stamp the entire back catalogue.
    for (const key of ["fieldNickname", "fieldMobile", "fieldEmail"]) {
      expect(backfillStatement, key).not.toContain(`"${key}"`)
    }
  })
})

describe("what the backfill stamps", () => {
  it("stamps a row with an admin-intent toggle on", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id, { sectionDietary: true })

    await runBackfill()

    expect(await stampOf(row.id)).not.toBeNull()
  })

  it("stamps a row whose only edit was the success message", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id, { successMessage: "See you there!" })

    await runBackfill()

    expect(await stampOf(row.id)).not.toBeNull()
  })

  it("stamps every admin-intent toggle, one at a time", async () => {
    // Catches a key that is in the SQL but misspelled, which the string check
    // above cannot see.
    //
    // One row per key, all seeded up front, then a single backfill over the lot.
    // It used to truncate and re-run per key — a `TRUNCATE ... CASCADE` on
    // `Event` per iteration, which fans out across every table that references
    // it. That cost ~1.5s locally and timed out CI's default 5s budget the first
    // time the runner's Postgres was mid-checkpoint. Nothing is lost by letting
    // the rows accumulate: each assertion names its own row, and a misspelled
    // key still leaves exactly that row unstamped.
    const rows: { key: string; id: string }[] = []
    for (const key of ADMIN_INTENT_TOGGLE_KEYS) {
      const event = await seedEvent()
      const row = await seedUnstampedConfig(event.id, { [key]: true })
      rows.push({ key, id: row.id })
    }

    await runBackfill()

    for (const { key, id } of rows) {
      expect(await stampOf(id), key).not.toBeNull()
    }
  })

  it("leaves a bare row alone — nobody configured it", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id)

    await runBackfill()

    expect(await stampOf(row.id)).toBeNull()
  })

  it("leaves the nickname migration's rows alone", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id, { fieldNickname: true })

    await runBackfill()

    expect(await stampOf(row.id)).toBeNull()
  })

  it("leaves a row carrying only the default identity fields alone", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id, { fieldMobile: true, fieldEmail: true })

    await runBackfill()

    expect(await stampOf(row.id)).toBeNull()
  })
})

describe("re-running is safe", () => {
  it("does not overwrite a stamp a real save has since written", async () => {
    // The idempotency guard. A retried deploy must not rewrite an admin's
    // timestamp with a fresh one.
    const event = await seedEvent()
    const saved = new Date("2026-01-01T00:00:00.000Z")
    const row = await db.eventFormConfig.create({
      data: {
        eventId: event.id,
        context: "Register",
        sectionDietary: true,
        configuredAt: saved,
      },
    })

    await runBackfill()
    await runBackfill()

    expect(await stampOf(row.id)).toEqual(saved)
  })

  it("stamps from updatedAt, not from the moment the migration ran", async () => {
    const event = await seedEvent()
    const row = await seedUnstampedConfig(event.id, { sectionDietary: true })
    const { updatedAt } = (await db.eventFormConfig.findUniqueOrThrow({
      where: { id: row.id },
      select: { updatedAt: true },
    }))

    await runBackfill()

    expect(await stampOf(row.id)).toEqual(updatedAt)
  })
})
