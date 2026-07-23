-- Catch Mech volunteer follow-up sessions and response audit context.
-- Written idempotently so a partially applied migration can be retried safely.

ALTER TYPE "ConfirmationSubmissionSource" ADD VALUE IF NOT EXISTS 'CatchMechVolunteer';

CREATE TABLE IF NOT EXISTS "CatchMechVolunteerSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatchMechVolunteerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CatchMechVolunteerSession_token_key"
  ON "CatchMechVolunteerSession"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "CatchMechVolunteerSession_eventId_volunteerId_key"
  ON "CatchMechVolunteerSession"("eventId", "volunteerId");
CREATE INDEX IF NOT EXISTS "CatchMechVolunteerSession_eventId_createdAt_idx"
  ON "CatchMechVolunteerSession"("eventId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CatchMechVolunteerSession"
    ADD CONSTRAINT "CatchMechVolunteerSession_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CatchMechVolunteerSession"
    ADD CONSTRAINT "CatchMechVolunteerSession_volunteerId_fkey"
    FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ConfirmationSubmission"
  ADD COLUMN IF NOT EXISTS "volunteerSessionId" TEXT;

CREATE INDEX IF NOT EXISTS "ConfirmationSubmission_volunteerSessionId_idx"
  ON "ConfirmationSubmission"("volunteerSessionId");

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission"
    ADD CONSTRAINT "ConfirmationSubmission_volunteerSessionId_fkey"
    FOREIGN KEY ("volunteerSessionId") REFERENCES "CatchMechVolunteerSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
