-- Allow a groupless decline: a Timothy who leads no group yet can still decline
-- someone, and the rejection has no small group to point at.
ALTER TABLE "SmallGroupMemberRequest" ALTER COLUMN "smallGroupId" DROP NOT NULL;

-- Scopes a groupless decline to the faci who made it (lead vs co-faci share a breakout).
ALTER TABLE "SmallGroupMemberRequest" ADD COLUMN IF NOT EXISTS "declinedByVolunteerId" TEXT;

CREATE INDEX IF NOT EXISTS "SmallGroupMemberRequest_declinedByVolunteerId_idx"
  ON "SmallGroupMemberRequest"("declinedByVolunteerId");

DO $$ BEGIN
  ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_declinedByVolunteerId_fkey"
    FOREIGN KEY ("declinedByVolunteerId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
