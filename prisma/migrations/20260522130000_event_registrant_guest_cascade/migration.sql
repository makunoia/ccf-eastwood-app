-- Change EventRegistrant.guestId FK to CASCADE so deleting a Guest also removes their registrations

ALTER TABLE "EventRegistrant" DROP CONSTRAINT IF EXISTS "EventRegistrant_guestId_fkey";

DO $$ BEGIN
  ALTER TABLE "EventRegistrant" ADD CONSTRAINT "EventRegistrant_guestId_fkey"
    FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
