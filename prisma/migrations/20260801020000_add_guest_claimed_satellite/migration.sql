-- Self-reported DGroup that meets at another CCF satellite, where there is no
-- local SmallGroup to reference. Mutually exclusive with "claimedSmallGroupId"
-- (app-enforced).
ALTER TABLE "Guest" ADD COLUMN IF NOT EXISTS "claimedSatellite" TEXT;
