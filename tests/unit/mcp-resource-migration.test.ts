import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  "prisma/migrations/20260911140000_repair_mcp_resource_columns/migration.sql",
  "utf8",
)

describe("MCP OAuth resource repair migration", () => {
  it("repairs both resource columns idempotently", () => {
    expect(migration).toContain('ALTER TABLE "McpAuthorizationCode" ADD COLUMN IF NOT EXISTS "resource" TEXT')
    expect(migration).toContain('ALTER TABLE "McpToken" ADD COLUMN IF NOT EXISTS "resource" TEXT')
    expect(migration.match(/WHERE "resource" IS NULL/g)).toHaveLength(2)
    expect(migration.match(/ALTER COLUMN "resource" SET NOT NULL/g)).toHaveLength(2)
  })
})
