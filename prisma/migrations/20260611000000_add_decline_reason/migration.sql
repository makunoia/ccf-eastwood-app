DO $$ BEGIN
  CREATE TYPE "DeclineReason" AS ENUM ('NotInterested', 'Unresponsive', 'EndorsedToAnotherLeader', 'AlreadyInSmallGroup', 'Others');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SmallGroupMemberRequest" ADD COLUMN IF NOT EXISTS "declineReason" "DeclineReason";
