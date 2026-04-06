-- ─── 1. EventType enum ───────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventType') THEN
        CREATE TYPE "EventType" AS ENUM ('OneTime', 'MultiDay', 'Recurring');
    END IF;
END $$;

-- ─── 2. RecurrenceFrequency enum ─────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecurrenceFrequency') THEN
        CREATE TYPE "RecurrenceFrequency" AS ENUM ('Weekly', 'Biweekly', 'Monthly');
    END IF;
END $$;

-- ─── 3. Event — add type + recurring fields ───────────────────────────────────
ALTER TABLE "Event"
    ADD COLUMN IF NOT EXISTS "type" "EventType" NOT NULL DEFAULT 'OneTime',
    ADD COLUMN IF NOT EXISTS "recurrenceDayOfWeek" INTEGER,
    ADD COLUMN IF NOT EXISTS "recurrenceFrequency" "RecurrenceFrequency",
    ADD COLUMN IF NOT EXISTS "recurrenceEndDate" TIMESTAMP(3);

-- ─── 4. Guest model ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Guest" (
    "id"               TEXT NOT NULL,
    "firstName"        TEXT NOT NULL,
    "lastName"         TEXT NOT NULL,
    "email"            TEXT,
    "phone"            TEXT,
    "notes"            TEXT,
    "lifeStageId"      TEXT,
    "gender"           "Gender",
    "language"         TEXT,
    "birthDate"        TIMESTAMP(3),
    "workCity"         TEXT,
    "workIndustry"     TEXT,
    "meetingPreference" "MeetingPreference",
    "memberId"         TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Guest_memberId_key" ON "Guest"("memberId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Guest_lifeStageId_fkey'
    ) THEN
        ALTER TABLE "Guest"
            ADD CONSTRAINT "Guest_lifeStageId_fkey"
            FOREIGN KEY ("lifeStageId") REFERENCES "LifeStage"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Guest_memberId_fkey'
    ) THEN
        ALTER TABLE "Guest"
            ADD CONSTRAINT "Guest_memberId_fkey"
            FOREIGN KEY ("memberId") REFERENCES "Member"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 5. EventRegistrant — add guestId + updatedAt ────────────────────────────
ALTER TABLE "EventRegistrant"
    ADD COLUMN IF NOT EXISTS "guestId" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Back-fill updatedAt to createdAt for existing rows
UPDATE "EventRegistrant" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- Make updatedAt NOT NULL now that rows are populated
ALTER TABLE "EventRegistrant" ALTER COLUMN "updatedAt" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'EventRegistrant_guestId_fkey'
    ) THEN
        ALTER TABLE "EventRegistrant"
            ADD CONSTRAINT "EventRegistrant_guestId_fkey"
            FOREIGN KEY ("guestId") REFERENCES "Guest"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 6. EventOccurrence ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventOccurrence" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventOccurrence_eventId_date_key"
    ON "EventOccurrence"("eventId", "date");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'EventOccurrence_eventId_fkey'
    ) THEN
        ALTER TABLE "EventOccurrence"
            ADD CONSTRAINT "EventOccurrence_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 7. OccurrenceAttendee ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OccurrenceAttendee" (
    "id"           TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "registrantId" TEXT NOT NULL,
    "checkedInAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccurrenceAttendee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OccurrenceAttendee_occurrenceId_registrantId_key"
    ON "OccurrenceAttendee"("occurrenceId", "registrantId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'OccurrenceAttendee_occurrenceId_fkey'
    ) THEN
        ALTER TABLE "OccurrenceAttendee"
            ADD CONSTRAINT "OccurrenceAttendee_occurrenceId_fkey"
            FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'OccurrenceAttendee_registrantId_fkey'
    ) THEN
        ALTER TABLE "OccurrenceAttendee"
            ADD CONSTRAINT "OccurrenceAttendee_registrantId_fkey"
            FOREIGN KEY ("registrantId") REFERENCES "EventRegistrant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 8. BreakoutGroup — add updatedAt ────────────────────────────────────────
ALTER TABLE "BreakoutGroup" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "BreakoutGroup" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "BreakoutGroup" ALTER COLUMN "updatedAt" SET NOT NULL;

-- ─── 9. EventModule — add updatedAt ──────────────────────────────────────────
ALTER TABLE "EventModule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "EventModule" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "EventModule" ALTER COLUMN "updatedAt" SET NOT NULL;

-- ─── 10. SchedulePreference — add createdAt + updatedAt ──────────────────────
ALTER TABLE "SchedulePreference"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "SchedulePreference" SET "createdAt" = NOW(), "updatedAt" = NOW()
    WHERE "createdAt" IS NULL;
ALTER TABLE "SchedulePreference"
    ALTER COLUMN "createdAt" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- ─── 11. GroupMeetingSchedule — add createdAt + updatedAt ────────────────────
ALTER TABLE "GroupMeetingSchedule"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "GroupMeetingSchedule" SET "createdAt" = NOW(), "updatedAt" = NOW()
    WHERE "createdAt" IS NULL;
ALTER TABLE "GroupMeetingSchedule"
    ALTER COLUMN "createdAt" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- ─── 12. BreakoutGroupSchedule — add createdAt + updatedAt ───────────────────
ALTER TABLE "BreakoutGroupSchedule"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "BreakoutGroupSchedule" SET "createdAt" = NOW(), "updatedAt" = NOW()
    WHERE "createdAt" IS NULL;
ALTER TABLE "BreakoutGroupSchedule"
    ALTER COLUMN "createdAt" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- ─── 13. BaptismOptIn — ensure registrantId unique index exists ─────────────
-- registrantId @unique is required by Prisma for the one-to-one relation with EventRegistrant.
-- It also enforces the business rule: one baptism per registrant globally (across all events).
-- The compound @@unique([eventId, registrantId]) is a secondary constraint that's redundant
-- given the field-level unique, but retained for explicitness.
CREATE UNIQUE INDEX IF NOT EXISTS "BaptismOptIn_registrantId_key" ON "BaptismOptIn"("registrantId");
