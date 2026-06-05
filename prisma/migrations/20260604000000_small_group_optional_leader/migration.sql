-- Allow Small Groups to be imported without a leader.
-- Make SmallGroup.leaderId nullable (DROP NOT NULL is a no-op if already nullable).
ALTER TABLE "SmallGroup" ALTER COLUMN "leaderId" DROP NOT NULL;
