-- Add column (column did not previously exist in this environment)
ALTER TABLE "Event" ADD COLUMN "autoAssignBreakout" BOOLEAN NOT NULL DEFAULT false;

