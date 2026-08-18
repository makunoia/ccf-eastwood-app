-- CCF-148: Collab clusters — one event co-run by two ministries.
--
-- Two changes, both additive:
--   1. EventCluster.kind names the shape of the day. Default 'Parallel' leaves
--      every existing cluster behaving exactly as before.
--   2. BreakoutGroup gains a cluster owner alongside its event owner (XOR,
--      enforced at the app layer like EventFormConfig's). Dropping NOT NULL on
--      eventId is a pure widening: every existing row keeps its event.

DO $$ BEGIN
  CREATE TYPE "ClusterKind" AS ENUM ('Parallel', 'Collab');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EventCluster"
  ADD COLUMN IF NOT EXISTS "kind" "ClusterKind" NOT NULL DEFAULT 'Parallel';

ALTER TABLE "BreakoutGroup" ALTER COLUMN "eventId" DROP NOT NULL;

ALTER TABLE "BreakoutGroup" ADD COLUMN IF NOT EXISTS "clusterId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BreakoutGroup" ADD CONSTRAINT "BreakoutGroup_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BreakoutGroup_eventId_idx" ON "BreakoutGroup"("eventId");
CREATE INDEX IF NOT EXISTS "BreakoutGroup_clusterId_idx" ON "BreakoutGroup"("clusterId");
