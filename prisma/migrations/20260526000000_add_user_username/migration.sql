-- Add username column (nullable initially so we can backfill)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Backfill: derive username from existing email local-part, lowercased, sanitized
DO $$
BEGIN
  -- Step 1: seed username from email local-part for any row missing one
  UPDATE "User"
  SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^a-z0-9._-]', '', 'g'))
  WHERE "username" IS NULL AND "email" IS NOT NULL;

  -- Step 2: fallback for rows that still have NULL or empty username (no email, or email local-part stripped to '')
  UPDATE "User"
  SET "username" = 'user_' || substr("id", 1, 8)
  WHERE "username" IS NULL OR "username" = '';

  -- Step 3: deduplicate by appending suffix to collisions, preserving the oldest row's username unchanged
  WITH dupes AS (
    SELECT "id",
           "username",
           ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt" ASC, "id" ASC) AS rn
    FROM "User"
  )
  UPDATE "User" u
  SET "username" = u."username" || '_' || (dupes.rn - 1)::text
  FROM dupes
  WHERE u."id" = dupes."id"
    AND dupes.rn > 1;
END $$;

-- Enforce NOT NULL now that all rows have a value
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- Unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- Make email optional (no longer the primary identifier)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
