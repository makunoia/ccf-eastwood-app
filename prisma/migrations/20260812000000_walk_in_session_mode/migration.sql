-- Walk-in session mode: pin one session, or follow the latest one created.
DO $$ BEGIN
  CREATE TYPE "WalkInSessionMode" AS ENUM ('Pinned', 'Latest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "walkInSessionMode" "WalkInSessionMode" NOT NULL DEFAULT 'Pinned';
