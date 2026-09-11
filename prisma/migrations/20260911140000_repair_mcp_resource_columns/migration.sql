-- The initial MCP migration may already have been recorded before these
-- OAuth resource-binding columns were added to that migration file.
ALTER TABLE "McpAuthorizationCode" ADD COLUMN IF NOT EXISTS "resource" TEXT;
UPDATE "McpAuthorizationCode" SET "resource" = '' WHERE "resource" IS NULL;
ALTER TABLE "McpAuthorizationCode" ALTER COLUMN "resource" SET NOT NULL;

ALTER TABLE "McpToken" ADD COLUMN IF NOT EXISTS "resource" TEXT;
UPDATE "McpToken" SET "resource" = '' WHERE "resource" IS NULL;
ALTER TABLE "McpToken" ALTER COLUMN "resource" SET NOT NULL;
