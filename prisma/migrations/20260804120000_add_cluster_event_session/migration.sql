-- Session selection for cluster-linked events (nullable — legacy links keep
-- date-window behavior). Additive only: no rows are updated or deleted.
ALTER TABLE "EventClusterEvent" ADD COLUMN IF NOT EXISTS "occurrenceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "EventClusterEvent" ADD CONSTRAINT "EventClusterEvent_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "EventClusterEvent_occurrenceId_idx" ON "EventClusterEvent"("occurrenceId");
