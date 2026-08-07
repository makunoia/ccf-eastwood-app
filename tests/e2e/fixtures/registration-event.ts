import { test as base } from "@playwright/test"
import { Client } from "pg"
import { randomUUID } from "node:crypto"

/**
 * Seeds a real, publicly-registerable event so the registration specs can drive the
 * actual form instead of asserting 404s. Everything created here is torn down after
 * the test — deleting the Event cascades to its form config.
 *
 * The run is pinned to the local test DB by `playwright.config.ts`; don't point it
 * at a shared database.
 *
 * Deliberate deviation from the "Prisma client only, no raw SQL" convention: the
 * generated Prisma client is ESM (`import.meta.url`) and Playwright's TypeScript
 * loader runs this repo's files as CJS, so importing `@/lib/db` here throws at load
 * time. Seeding over `pg` keeps the fixture in-process; the alternative is spawning
 * a separate tsx runtime per test. App code is unaffected.
 */
export type SeededEvent = {
  id: string
  name: string
  /** Path to the public registration form. */
  registerPath: string
}

type Fixtures = {
  /** A OneTime event whose Register form has the DGroup step and its Selects on. */
  dgroupEvent: SeededEvent
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export const test = base.extend<Fixtures>({
  // Named `provide` rather than Playwright's conventional `use` so the React hooks
  // lint rule doesn't read this as a misplaced `use()` call.
  dgroupEvent: async ({}, provide) => {
    const id = `e2e-${randomUUID()}`
    const name = `E2E DGroup Registration ${Date.now()}`
    const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await withDb(async (client) => {
      // registrationStart/End left null so the registration-window gate on the page
      // never closes the form out from under a spec.
      await client.query(
        `INSERT INTO "Event" ("id", "name", "type", "startDate", "endDate", "updatedAt")
         VALUES ($1, $2, 'OneTime', $3, $3, NOW())`,
        [id, name, inAWeek]
      )

      // sectionSmallGroup makes the form multi-step (Personal Information → DGroup
      // Info); the field toggles are what put the Radix overlays on that second
      // step — Language is a DropdownMenu, the other three resolve to Selects.
      await client.query(
        `INSERT INTO "EventFormConfig"
           ("id", "eventId", "context", "sectionSmallGroup",
            "fieldLanguage", "fieldMeetingPreference", "fieldWorkCity", "fieldSchedule",
            "updatedAt")
         VALUES ($1, $2, 'Register', true, true, true, true, true, NOW())`,
        [`e2e-cfg-${randomUUID()}`, id]
      )
    })

    await provide({ id, name, registerPath: `/events/${id}/register` })

    await withDb((client) => client.query(`DELETE FROM "Event" WHERE "id" = $1`, [id]))
  },
})

export { expect } from "@playwright/test"
