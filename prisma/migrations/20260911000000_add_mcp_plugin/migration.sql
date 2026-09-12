DO $$ BEGIN
  CREATE TYPE "McpAuthorizationStatus" AS ENUM ('Pending', 'Consumed', 'Revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SmallGroupLogAction" ADD VALUE IF NOT EXISTS 'GroupUpdated';

DO $$ BEGIN
  CREATE TYPE "DGroupImportBatchStatus" AS ENUM ('Draft', 'NeedsClarification', 'ReadyForReview', 'Applying', 'Completed', 'CompletedWithErrors', 'Undone', 'UndoConflicts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DGroupImportChangeStatus" AS ENUM ('Proposed', 'NeedsReview', 'Applied', 'Skipped', 'Undone', 'UndoConflict');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "McpAuthorizationCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
  "status" "McpAuthorizationStatus" NOT NULL DEFAULT 'Pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "McpAuthorizationCode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "McpAuthorizationCode" ADD COLUMN IF NOT EXISTS "resource" TEXT;
UPDATE "McpAuthorizationCode" SET "resource" = '' WHERE "resource" IS NULL;
ALTER TABLE "McpAuthorizationCode" ALTER COLUMN "resource" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "McpAuthorizationCode_codeHash_key" ON "McpAuthorizationCode"("codeHash");
CREATE INDEX IF NOT EXISTS "McpAuthorizationCode_userId_expiresAt_idx" ON "McpAuthorizationCode"("userId", "expiresAt");

CREATE TABLE IF NOT EXISTS "McpToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "McpToken" ADD COLUMN IF NOT EXISTS "resource" TEXT;
UPDATE "McpToken" SET "resource" = '' WHERE "resource" IS NULL;
ALTER TABLE "McpToken" ALTER COLUMN "resource" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "McpToken_accessTokenHash_key" ON "McpToken"("accessTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "McpToken_refreshTokenHash_key" ON "McpToken"("refreshTokenHash");
CREATE INDEX IF NOT EXISTS "McpToken_userId_revokedAt_idx" ON "McpToken"("userId", "revokedAt");

CREATE TABLE IF NOT EXISTS "DGroupImportBatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sourceKey" TEXT,
  "status" "DGroupImportBatchStatus" NOT NULL DEFAULT 'Draft',
  "parsedTables" JSONB,
  "columnDecisions" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "undoUntil" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DGroupImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DGroupImportBatch_userId_createdAt_idx" ON "DGroupImportBatch"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DGroupImportBatch_expiresAt_idx" ON "DGroupImportBatch"("expiresAt");

CREATE TABLE IF NOT EXISTS "DGroupImportChange" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceSheet" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "DGroupImportChangeStatus" NOT NULL DEFAULT 'Proposed',
  "targetType" TEXT,
  "targetId" TEXT,
  "proposedData" JSONB NOT NULL,
  "appliedData" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DGroupImportChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DGroupImportChange_batchId_status_idx" ON "DGroupImportChange"("batchId", "status");

DO $$ BEGIN
  ALTER TABLE "McpAuthorizationCode" ADD CONSTRAINT "McpAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DGroupImportBatch" ADD CONSTRAINT "DGroupImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DGroupImportChange" ADD CONSTRAINT "DGroupImportChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DGroupImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
