-- Restores the invariant that every DGroup has a leader.
--
-- 20260606145226 (subject: occurrence series grouping) swept SmallGroup.leaderId
-- into ON DELETE SET NULL as collateral, so deleting a member silently left every
-- group they led with no leader and no log entry. Nothing in the app writes a null
-- leader deliberately and no screen renders a leaderless group.

-- Fail loudly rather than invent a leader. If this raises, assign a leader to each
-- listed group and re-run — the migration is safe to retry.
DO $$
DECLARE orphaned TEXT;
BEGIN
  SELECT string_agg("id" || ' (' || "name" || ')', ', ')
    INTO orphaned
    FROM "SmallGroup"
   WHERE "leaderId" IS NULL;

  IF orphaned IS NOT NULL THEN
    RAISE EXCEPTION 'SmallGroup.leaderId cannot be made NOT NULL — these groups have no leader: %. Assign a leader to each, then re-run this migration.', orphaned;
  END IF;
END $$;

-- No-op when already NOT NULL, so a retry after a partial run is safe.
ALTER TABLE "SmallGroup" ALTER COLUMN "leaderId" SET NOT NULL;

-- Replace SET NULL with RESTRICT so the database refuses the delete outright.
ALTER TABLE "SmallGroup" DROP CONSTRAINT IF EXISTS "SmallGroup_leaderId_fkey";

DO $$ BEGIN
  ALTER TABLE "SmallGroup" ADD CONSTRAINT "SmallGroup_leaderId_fkey"
    FOREIGN KEY ("leaderId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
