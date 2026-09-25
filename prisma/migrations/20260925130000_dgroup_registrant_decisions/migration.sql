ALTER TABLE "SmallGroupMemberRequest"
  ADD COLUMN IF NOT EXISTS "registrantClaimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "registrantCancelledAt" TIMESTAMP(3);
