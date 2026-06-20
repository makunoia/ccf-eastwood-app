-- Add setup-walkthrough dismissal marker to Event.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "setupDismissedAt" TIMESTAMP(3);
