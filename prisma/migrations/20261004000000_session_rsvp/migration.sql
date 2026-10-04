ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "registrationRsvpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventCluster" ADD COLUMN IF NOT EXISTS "registrationRsvpEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "SessionRsvp" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "registrantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionRsvp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SessionRsvp_occurrenceId_registrantId_key" ON "SessionRsvp"("occurrenceId", "registrantId");
CREATE INDEX IF NOT EXISTS "SessionRsvp_registrantId_idx" ON "SessionRsvp"("registrantId");
DO $$ BEGIN
  ALTER TABLE "SessionRsvp" ADD CONSTRAINT "SessionRsvp_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SessionRsvp" ADD CONSTRAINT "SessionRsvp_registrantId_fkey" FOREIGN KEY ("registrantId") REFERENCES "EventRegistrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
