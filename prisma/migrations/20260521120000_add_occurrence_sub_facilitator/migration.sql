-- FacilitatorRole enum
DO $$ BEGIN
  CREATE TYPE "FacilitatorRole" AS ENUM ('Facilitator', 'CoFacilitator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- OccurrenceSubFacilitator table
CREATE TABLE IF NOT EXISTS "OccurrenceSubFacilitator" (
  "id"              TEXT NOT NULL,
  "occurrenceId"    TEXT NOT NULL,
  "breakoutGroupId" TEXT NOT NULL,
  "role"            "FacilitatorRole" NOT NULL,
  "substituteId"    TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OccurrenceSubFacilitator_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator"
    ADD CONSTRAINT "OccurrenceSubFacilitator_occurrenceId_breakoutGroupId_role_key"
    UNIQUE ("occurrenceId", "breakoutGroupId", "role");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator"
    ADD CONSTRAINT "OccurrenceSubFacilitator_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator"
    ADD CONSTRAINT "OccurrenceSubFacilitator_breakoutGroupId_fkey"
    FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator"
    ADD CONSTRAINT "OccurrenceSubFacilitator_substituteId_fkey"
    FOREIGN KEY ("substituteId") REFERENCES "Volunteer"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
