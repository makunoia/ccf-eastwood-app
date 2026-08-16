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

/** A Member the step-0 lookup can find, with a birthday to prove against. */
export type SeededMember = {
  id: string
  firstName: string
  lastName: string
  /** Canonical, as stored. */
  mobile: string
  /**
   * The ten local digits, which is what `PhonePHInput` actually accepts — it
   * renders `917 123 4567` and normalises to the canonical form on the way out.
   * A spec that types this and still finds the record is the UI-level proof that
   * input format doesn't matter.
   */
  local: string
  birthMonth: string
  birthYear: string
}

type Fixtures = {
  /** A OneTime event whose Register form has the DGroup step and its Selects on. */
  dgroupEvent: SeededEvent
  /** An existing member for the CCF-147 shortened flow. */
  returningMember: SeededMember
  /**
   * `returningMember`, already holding a registration for `dgroupEvent` — the
   * person the step-0 screen exists for.
   */
  alreadyRegistered: SeededMember
  /**
   * The same, on an event that has since started *requiring* Life Stage — the
   * admin-changed-the-form case, where being already registered is a detour
   * rather than a dead end.
   */
  nowRequiresLifeStage: SeededMember
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

  returningMember: async ({}, provide) => {
    const id = `e2e-m-${randomUUID()}`
    // A number nobody else in the test DB holds, so the lookup can't come back
    // ambiguous and land the spec on the picker instead of the confirm card.
    const suffix = String(Math.floor(1_000_000 + Math.random() * 8_999_999))
    const local = `917${suffix}`
    const mobile = `+63 917 ${suffix.slice(0, 3)} ${suffix.slice(3)}`

    await withDb(async (client) => {
      // `language` is a non-nullable scalar list — omitting it violates the
      // constraint, the raw-SQL twin of the Prisma `language: []` requirement.
      await client.query(
        `INSERT INTO "Member"
           ("id", "firstName", "lastName", "phone", "email",
            "birthMonth", "birthYear", "workCity", "dateJoined", "language", "updatedAt")
         VALUES ($1, 'Maria', 'Santos', $2, $3, 4, 1992, 'Makati', NOW(), '{}'::text[], NOW())`,
        [id, mobile, `e2e-${id}@example.com`]
      )
    })

    await provide({
      id,
      firstName: "Maria",
      lastName: "Santos",
      mobile,
      local,
      birthMonth: "April",
      birthYear: "1992",
    })

    await withDb((client) => client.query(`DELETE FROM "Member" WHERE "id" = $1`, [id]))
  },

  /**
   * Depends on both parents so the registration can point at each. Its own teardown
   * removes the row rather than leaning on the Event cascade: Playwright tears down
   * dependent fixtures first, but the *order* the two parents unwind in isn't
   * guaranteed, and a registrant outliving its member would fail the next run.
   */
  alreadyRegistered: async ({ dgroupEvent, returningMember }, provide) => {
    const id = `e2e-r-${randomUUID()}`
    await withDb((client) =>
      client.query(
        `INSERT INTO "EventRegistrant" ("id", "eventId", "memberId", "updatedAt")
         VALUES ($1, $2, $3, NOW())`,
        [id, dgroupEvent.id, returningMember.id]
      )
    )

    await provide(returningMember)

    await withDb((client) =>
      client.query(`DELETE FROM "EventRegistrant" WHERE "id" = $1`, [id])
    )
  },

  /**
   * The scenario the amend flow was built for: the person registered, and *then*
   * the admin made a field required. `dgroupEvent`'s config enables several fields
   * but requires none, so this flips exactly one — Life Stage, which sits in
   * Personal Information rather than under the DGroup step, so it is asked of
   * everyone rather than only of someone seeking a group.
   */
  nowRequiresLifeStage: async ({ dgroupEvent, alreadyRegistered }, provide) => {
    await withDb((client) =>
      client.query(
        `UPDATE "EventFormConfig"
            SET "fieldLifeStage" = true, "fieldLifeStageRequired" = true
          WHERE "eventId" = $1 AND "context" = 'Register'`,
        [dgroupEvent.id]
      )
    )

    await provide(alreadyRegistered)

    await withDb((client) =>
      client.query(
        `UPDATE "EventFormConfig"
            SET "fieldLifeStage" = false, "fieldLifeStageRequired" = false
          WHERE "eventId" = $1 AND "context" = 'Register'`,
        [dgroupEvent.id]
      )
    )
  },
})

/**
 * Open the registration form past the CCF-147 mobile-number gate.
 *
 * Every spec that wants the form itself goes through here, so the gate is
 * exercised exactly once (in the specs that are about it) rather than being
 * re-navigated by hand in a dozen places.
 */
export async function startFormManually(
  page: import("@playwright/test").Page,
  registerPath: string
) {
  await page.goto(registerPath)
  await page.getByRole("button", { name: "Start a new registration" }).click()
}

export { expect } from "@playwright/test"
