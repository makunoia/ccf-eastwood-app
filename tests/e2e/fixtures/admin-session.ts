import { test as base, type Page } from "@playwright/test"
import { Client } from "pg"
import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"

/**
 * A signed-in Super Admin, plus a couple of members to fill a table with.
 *
 * The seeded user has `totpEnabled: false`, `mustChangePassword: false` and
 * `requiresTotpSetup: false`, so `authorize()` takes the plain
 * username + password branch and the login form is a single step — no TOTP
 * choreography in the spec.
 *
 * Seeded over `pg` rather than Prisma for the reason spelled out in
 * `registration-event.ts`: the generated client is ESM and Playwright loads this
 * repo's files as CJS.
 */

export type SeededAdmin = {
  id: string
  username: string
  password: string
}

type Fixtures = {
  admin: SeededAdmin
  /** A page that has already been through the login form. */
  adminPage: Page
}

async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  return client
}

export const test = base.extend<Fixtures>({
  // Named `provide` rather than Playwright's conventional `use` so the React
  // hooks lint rule doesn't read this as a misplaced `use()` call — same reason
  // as in registration-event.ts.
  admin: async ({}, provide) => {
    const client = await connect()
    const id = randomUUID()
    const username = `e2e-admin-${id.slice(0, 8)}`
    const password = "e2e-Password-1"
    const memberIds = [randomUUID(), randomUUID()]

    try {
      await client.query(
        `INSERT INTO "User" (id, name, username, password, role, "mustChangePassword",
           "requiresTotpSetup", "totpEnabled", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'SuperAdmin', false, false, false, NOW(), NOW())`,
        [id, "E2E Admin", username, await bcrypt.hash(password, 10)],
      )

      // Two members so the Members table has rows to draw columns over.
      for (const [index, memberId] of memberIds.entries()) {
        await client.query(
          `INSERT INTO "Member" (id, "firstName", "lastName", email, phone, "dateJoined",
             language, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), '{}', NOW(), NOW())`,
          [
            memberId,
            `Columns${index}`,
            `Fixture${id.slice(0, 6)}`,
            `person${index}.${id.slice(0, 6)}@example.com`,
            `+63 917 555 ${String(1000 + index).slice(0, 4)}`,
          ],
        )
      }

      await provide({ id, username, password })
    } finally {
      await client.query(`DELETE FROM "Member" WHERE id = ANY($1)`, [memberIds])
      // Cascades to UserTablePreference, which is the point of the spec.
      await client.query(`DELETE FROM "User" WHERE id = $1`, [id])
      await client.end()
    }
  },

  adminPage: async ({ page, admin }, provide) => {
    await page.goto("/login")
    // By id, not by label: the password field shares its accessible name with
    // the "Show password" toggle sitting inside it.
    await page.locator("#username").fill(admin.username)
    await page.locator("#password").fill(admin.password)
    await page.getByRole("button", { name: /sign in|log in/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 })
    await provide(page)
  },
})

export { expect } from "@playwright/test"
