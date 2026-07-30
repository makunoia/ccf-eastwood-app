-- CCF-101: registration "I want to join a DGroup" intent becomes a real,
-- admin-visible request. `origin` distinguishes those from every pre-existing
-- path (which all target a specific group); `sourceEventId` records which event's
-- form produced the intent.

DO $$ BEGIN
  CREATE TYPE "SmallGroupRequestOrigin" AS ENUM ('Assignment', 'RegistrationIntent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SmallGroupMemberRequest"
  ADD COLUMN IF NOT EXISTS "origin" "SmallGroupRequestOrigin" NOT NULL DEFAULT 'Assignment';

ALTER TABLE "SmallGroupMemberRequest" ADD COLUMN IF NOT EXISTS "sourceEventId" TEXT;

CREATE INDEX IF NOT EXISTS "SmallGroupMemberRequest_sourceEventId_idx"
  ON "SmallGroupMemberRequest"("sourceEventId");

-- Seekers are read as (origin, status) with a null group, so index that path.
CREATE INDEX IF NOT EXISTS "SmallGroupMemberRequest_origin_status_idx"
  ON "SmallGroupMemberRequest"("origin", "status");

DO $$ BEGIN
  ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
