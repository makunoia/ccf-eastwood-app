-- CreateEnum: PermissionAction
DO $$ BEGIN
  CREATE TYPE "PermissionAction" AS ENUM ('Read', 'Write', 'Import', 'Export');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add action column with default Read
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "action" "PermissionAction" NOT NULL DEFAULT 'Read';

-- DropIndex: old unique on [userId, feature] (must happen before new index is created)
DROP INDEX IF EXISTS "UserPermission_userId_feature_key";

-- CreateIndex: new unique on [userId, feature, action] (must exist before ON CONFLICT below)
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_feature_action_key"
  ON "UserPermission"("userId", "feature", "action");

-- Data migration: for each existing permission row that only has the 'Read' default,
-- insert the missing Write, Import, Export rows so existing staff retain full access.
INSERT INTO "UserPermission" ("id", "userId", "feature", "action")
SELECT gen_random_uuid()::TEXT, "userId", "feature", unnest(ARRAY['Write', 'Import', 'Export']::"PermissionAction"[])
FROM "UserPermission"
WHERE "action" = 'Read'
ON CONFLICT ("userId", "feature", "action") DO NOTHING;
