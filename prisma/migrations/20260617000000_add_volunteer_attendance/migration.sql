-- Make OccurrenceAttendee subject-polymorphic (registrant XOR volunteer) and add the
-- OneTime volunteer attendance marker. Written idempotently per project conventions.

-- 1. registrantId becomes nullable (volunteer attendance rows have it null)
ALTER TABLE "OccurrenceAttendee" ALTER COLUMN "registrantId" DROP NOT NULL;

-- 2. New polymorphic FK column for volunteer attendance
ALTER TABLE "OccurrenceAttendee" ADD COLUMN IF NOT EXISTS "volunteerId" TEXT;

-- 3. OneTime volunteer attendance marker (mirrors EventRegistrant.attendedAt)
ALTER TABLE "Volunteer" ADD COLUMN IF NOT EXISTS "attendedAt" TIMESTAMP(3);

-- 4. FK: OccurrenceAttendee.volunteerId -> Volunteer.id
DO $$ BEGIN
  ALTER TABLE "OccurrenceAttendee" ADD CONSTRAINT "OccurrenceAttendee_volunteerId_fkey"
    FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Unique (occurrenceId, volunteerId) — NULL volunteerId rows (registrant attendance)
--    are treated as distinct by Postgres, so this does not collide with registrant rows.
CREATE UNIQUE INDEX IF NOT EXISTS "OccurrenceAttendee_occurrenceId_volunteerId_key"
  ON "OccurrenceAttendee"("occurrenceId", "volunteerId");
