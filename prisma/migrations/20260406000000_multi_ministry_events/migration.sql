-- ─── 1. Create EventMinistry junction table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventMinistry" (
    "eventId"    TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventMinistry_pkey" PRIMARY KEY ("eventId", "ministryId")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'EventMinistry_eventId_fkey'
    ) THEN
        ALTER TABLE "EventMinistry"
            ADD CONSTRAINT "EventMinistry_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'EventMinistry_ministryId_fkey'
    ) THEN
        ALTER TABLE "EventMinistry"
            ADD CONSTRAINT "EventMinistry_ministryId_fkey"
            FOREIGN KEY ("ministryId") REFERENCES "Ministry"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 2. Migrate existing ministryId data to EventMinistry ─────────────────────
-- Copy each event's single ministry into the new junction table.
-- Only insert where the ministryId column still exists and is non-null.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Event' AND column_name = 'ministryId'
    ) THEN
        INSERT INTO "EventMinistry" ("eventId", "ministryId")
        SELECT "id", "ministryId" FROM "Event"
        WHERE "ministryId" IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ─── 3. Drop ministryId FK constraint then column from Event ─────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Event_ministryId_fkey'
    ) THEN
        ALTER TABLE "Event" DROP CONSTRAINT "Event_ministryId_fkey";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Event' AND column_name = 'ministryId'
    ) THEN
        ALTER TABLE "Event" DROP COLUMN "ministryId";
    END IF;
END $$;
