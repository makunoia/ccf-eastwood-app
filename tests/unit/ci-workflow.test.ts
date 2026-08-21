import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Regression: every authenticated e2e spec failed in CI and passed on a laptop.
 *
 * A production build of Auth.js refuses to trust the incoming Host header
 * unless one of AUTH_URL / AUTH_TRUST_HOST / VERCEL is set, and throws
 * `UntrustedHost` from every `auth()` call instead. The CI job serves the app to
 * itself on http://localhost:3100, so the host is trusted by construction — but
 * nothing said so, and the failure surfaced as a login form answering "Invalid
 * username or password" with each dashboard route bouncing back to /login.
 *
 * It passed locally because `next start` loads a gitignored `.env.production`
 * that Vercel CLI had written with VERCEL=1 — the laptop was accidentally
 * claiming to be Vercel. Nothing in the app can pin this, because it is true
 * only of the environment the workflow builds; so the workflow is what's pinned.
 */
const workflow = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
)

describe("CI workflow", () => {
  it("tells Auth.js the host it serves the app on is trusted", () => {
    expect(workflow).toMatch(/^\s*AUTH_TRUST_HOST:/m)
  })

  it("still gives the app a database and an auth secret", () => {
    expect(workflow).toMatch(/^\s*DATABASE_URL:/m)
    expect(workflow).toMatch(/^\s*AUTH_SECRET:/m)
  })

  it("uploads the traces a failed run leaves behind, not just the HTML report", () => {
    // `test-results/` is where the trace and page snapshot for each failure
    // land. Uploading only `playwright-report/` — which the `github` reporter
    // never writes — meant three red runs uploaded nothing to look at.
    expect(workflow).toContain("test-results/")
  })
})
