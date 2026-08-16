-- Per-step skip for the event setup walkthrough.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "setupSkippedSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
