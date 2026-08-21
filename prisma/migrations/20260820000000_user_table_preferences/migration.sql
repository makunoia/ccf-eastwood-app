-- Per-user saved table layouts (column visibility, order, density).
-- Written idempotent per CLAUDE.md so a partial run can be retried safely.

DO $$ BEGIN
  CREATE TYPE "TableDensity" AS ENUM ('Compact', 'Comfortable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserTablePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "hidden" TEXT[],
    "shown" TEXT[],
    "order" TEXT[],
    "density" "TableDensity" NOT NULL DEFAULT 'Comfortable',
    "pageSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserTablePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserTablePreference_userId_tableKey_key"
  ON "UserTablePreference"("userId", "tableKey");

DO $$ BEGIN
  ALTER TABLE "UserTablePreference" ADD CONSTRAINT "UserTablePreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
