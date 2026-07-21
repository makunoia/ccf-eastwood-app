-- Confirmation submission log: one row per facilitator/leader form submission.
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

DO $$ BEGIN
  CREATE TYPE "ConfirmationSubmissionSource" AS ENUM ('CatchMech', 'SmallGroupLeader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ConfirmationSubmission" (
    "id" TEXT NOT NULL,
    "source" "ConfirmationSubmissionSource" NOT NULL,
    "sessionId" TEXT,
    "eventId" TEXT,
    "breakoutGroupId" TEXT,
    "facilitatorVolunteerId" TEXT,
    "smallGroupId" TEXT,
    "submittedByMemberId" TEXT,
    "submittedByName" TEXT NOT NULL,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "declinedCount" INTEGER NOT NULL DEFAULT 0,
    "deferredCount" INTEGER NOT NULL DEFAULT 0,
    "createdGroupId" TEXT,
    "decisions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConfirmationSubmission_eventId_createdAt_idx" ON "ConfirmationSubmission"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConfirmationSubmission_breakoutGroupId_idx" ON "ConfirmationSubmission"("breakoutGroupId");
CREATE INDEX IF NOT EXISTS "ConfirmationSubmission_facilitatorVolunteerId_idx" ON "ConfirmationSubmission"("facilitatorVolunteerId");
CREATE INDEX IF NOT EXISTS "ConfirmationSubmission_smallGroupId_idx" ON "ConfirmationSubmission"("smallGroupId");

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "CatchMechSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_breakoutGroupId_fkey"
    FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_facilitatorVolunteerId_fkey"
    FOREIGN KEY ("facilitatorVolunteerId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_smallGroupId_fkey"
    FOREIGN KEY ("smallGroupId") REFERENCES "SmallGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConfirmationSubmission" ADD CONSTRAINT "ConfirmationSubmission_submittedByMemberId_fkey"
    FOREIGN KEY ("submittedByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Actor on the per-person group history. Public token flows (Catch Mech facis,
-- small group leaders) have no User, so attribution needs a Member reference.
ALTER TABLE "SmallGroupLog" ADD COLUMN IF NOT EXISTS "performedByMemberId" TEXT;

CREATE INDEX IF NOT EXISTS "SmallGroupLog_performedByMemberId_idx" ON "SmallGroupLog"("performedByMemberId");

DO $$ BEGIN
  ALTER TABLE "SmallGroupLog" ADD CONSTRAINT "SmallGroupLog_performedByMemberId_fkey"
    FOREIGN KEY ("performedByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
