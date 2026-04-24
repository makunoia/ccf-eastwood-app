import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"

function normalizeTicketKey(raw: string): string {
  const normalized = raw.trim().toUpperCase()
  if (!/^CCF-\d+$/.test(normalized)) {
    throw new Error(`Invalid ticket key: ${raw}. Expected format CCF-123.`)
  }
  return normalized
}

function buildTemplate(ticketKey: string): string {
  return `import { describe, it, expect } from "vitest"

/**
 * Ticket verification suite for ${ticketKey}.
 *
 * Instructions for the AI agent / developer:
 *  1. Read the Jira ticket to understand what changed.
 *  2. Replace the TODO tests below with real assertions that prove the ticket works.
 *  3. Add unit tests for any pure logic (lib/**).
 *  4. Add integration tests for any Server Actions (import + call directly).
 *  5. Every test must pass before this PR can merge.
 *
 * Run locally:  pnpm verify:ticket ${ticketKey}
 */
describe("${ticketKey}", () => {
  describe("unit", () => {
    it.todo("TODO: describe expected behavior from the ticket acceptance criteria")
  })

  describe("integration", () => {
    it.todo("TODO: test the server action or DB mutation introduced by this ticket")
  })

  describe("regression", () => {
    it.todo("TODO: add a guard that would catch the bug this ticket fixes if it regressed")
  })
})
`
}

function main(): void {
  const rawKey = process.argv[2]
  if (!rawKey) {
    throw new Error("Missing ticket key. Usage: pnpm ticket:test:new CCF-123")
  }

  const ticketKey = normalizeTicketKey(rawKey)
  const fileName = `${ticketKey.toLowerCase()}.test.ts`
  const filePath = path.resolve(__dirname, "../tests/tickets", fileName)
  const displayPath = `tests/tickets/${fileName}`

  if (existsSync(filePath)) {
    console.log(`Verification file already exists: ${displayPath}`)
    return
  }

  writeFileSync(filePath, buildTemplate(ticketKey), "utf8")
  console.log(`Created ${displayPath}`)
  console.log(`Next: fill in the tests, then run: pnpm verify:ticket ${ticketKey}`)
}

main()
