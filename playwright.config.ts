import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

// E2E specs seed real rows (see tests/e2e/fixtures/registration-event.ts), so the
// run is pinned to the local test database rather than whatever `.env.local` points
// at — the same `ccf_test` the Vitest suite uses. `PLAYWRIGHT_DATABASE_URL` wins so
// CI can point somewhere else without editing this file.
const { parsed: testEnv = {} } = dotenv.config({ path: ".env.test" })
const databaseUrl =
  process.env.PLAYWRIGHT_DATABASE_URL ?? testEnv.DATABASE_URL ?? process.env.DATABASE_URL
if (databaseUrl) process.env.DATABASE_URL = databaseUrl

// Deliberately not 3000: the dev server this starts is pointed at the test DB, and
// reusing a server someone already has running would silently seed the dev one.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `github` annotates the failing lines in the PR diff; `html` is what the
  // workflow uploads. Only the first was configured, so a failed CI run
  // annotated the code and then uploaded an empty artifact.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the Next.js dev server automatically during local runs.
  // In CI, the server must be running before tests start.
  webServer: process.env.CI
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: databaseUrl ? { DATABASE_URL: databaseUrl } : undefined,
      },
})
