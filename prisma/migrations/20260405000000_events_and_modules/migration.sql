-- ─── 1. Remove Event.isPaid (redundant — price != null means paid) ────────────
ALTER TABLE "Event" DROP COLUMN IF EXISTS "isPaid";

-- ─── 2. Add EventRegistrant.paymentReference ─────────────────────────────────
ALTER TABLE "EventRegistrant" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;

-- ─── 3. Migrate BreakoutGroup matching fields ─────────────────────────────────
-- Remove old plain-text lifeStage column
ALTER TABLE "BreakoutGroup" DROP COLUMN IF EXISTS "lifeStage";

-- Add proper FK column and matching fields to match SmallGroup
ALTER TABLE "BreakoutGroup"
    ADD COLUMN IF NOT EXISTS "lifeStageId"  TEXT,
    ADD COLUMN IF NOT EXISTS "ageRangeMin"  INTEGER,
    ADD COLUMN IF NOT EXISTS "ageRangeMax"  INTEGER,
    ADD COLUMN IF NOT EXISTS "meetingFormat" "MeetingFormat",
    ADD COLUMN IF NOT EXISTS "locationCity"  TEXT;

-- AddForeignKey: BreakoutGroup.lifeStageId → LifeStage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BreakoutGroup_lifeStageId_fkey'
    ) THEN
        ALTER TABLE "BreakoutGroup"
            ADD CONSTRAINT "BreakoutGroup_lifeStageId_fkey"
            FOREIGN KEY ("lifeStageId") REFERENCES "LifeStage"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 4. Create BreakoutGroupSchedule ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BreakoutGroupSchedule" (
    "id"             TEXT NOT NULL,
    "breakoutGroupId" TEXT NOT NULL,
    "dayOfWeek"      INTEGER NOT NULL,
    "timeStart"      TEXT NOT NULL,
    "timeEnd"        TEXT NOT NULL,

    CONSTRAINT "BreakoutGroupSchedule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BreakoutGroupSchedule_breakoutGroupId_fkey'
    ) THEN
        ALTER TABLE "BreakoutGroupSchedule"
            ADD CONSTRAINT "BreakoutGroupSchedule_breakoutGroupId_fkey"
            FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 5. Create EventModuleType enum ──────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventModuleType') THEN
        CREATE TYPE "EventModuleType" AS ENUM ('Baptism', 'Embarkation');
    END IF;
END $$;

-- ─── 6. Create BusDirection enum ─────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BusDirection') THEN
        CREATE TYPE "BusDirection" AS ENUM ('ToVenue', 'FromVenue', 'Both');
    END IF;
END $$;

-- ─── 7. Create EventModule ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventModule" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "type"      "EventModuleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventModule_eventId_type_key"
    ON "EventModule"("eventId", "type");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'EventModule_eventId_fkey'
    ) THEN
        ALTER TABLE "EventModule"
            ADD CONSTRAINT "EventModule_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 8. Create BaptismOptIn ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BaptismOptIn" (
    "id"           TEXT NOT NULL,
    "eventId"      TEXT NOT NULL,
    "registrantId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaptismOptIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BaptismOptIn_registrantId_key"
    ON "BaptismOptIn"("registrantId");

CREATE UNIQUE INDEX IF NOT EXISTS "BaptismOptIn_eventId_registrantId_key"
    ON "BaptismOptIn"("eventId", "registrantId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BaptismOptIn_eventId_fkey'
    ) THEN
        ALTER TABLE "BaptismOptIn"
            ADD CONSTRAINT "BaptismOptIn_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BaptismOptIn_registrantId_fkey'
    ) THEN
        ALTER TABLE "BaptismOptIn"
            ADD CONSTRAINT "BaptismOptIn_registrantId_fkey"
            FOREIGN KEY ("registrantId") REFERENCES "EventRegistrant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 9. Create Bus ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Bus" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "capacity"  INTEGER,
    "direction" "BusDirection" NOT NULL DEFAULT 'ToVenue',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Bus_eventId_fkey'
    ) THEN
        ALTER TABLE "Bus"
            ADD CONSTRAINT "Bus_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 10. Create BusPassenger ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BusPassenger" (
    "id"           TEXT NOT NULL,
    "busId"        TEXT NOT NULL,
    "registrantId" TEXT,
    "volunteerId"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusPassenger_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BusPassenger_busId_fkey'
    ) THEN
        ALTER TABLE "BusPassenger"
            ADD CONSTRAINT "BusPassenger_busId_fkey"
            FOREIGN KEY ("busId") REFERENCES "Bus"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BusPassenger_registrantId_fkey'
    ) THEN
        ALTER TABLE "BusPassenger"
            ADD CONSTRAINT "BusPassenger_registrantId_fkey"
            FOREIGN KEY ("registrantId") REFERENCES "EventRegistrant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BusPassenger_volunteerId_fkey'
    ) THEN
        ALTER TABLE "BusPassenger"
            ADD CONSTRAINT "BusPassenger_volunteerId_fkey"
            FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
