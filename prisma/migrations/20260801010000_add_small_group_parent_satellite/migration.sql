-- Records upward accountability for DGroups whose leader reports to a leader
-- outside CCF Eastwood. Mutually exclusive with "parentGroupId" (app-enforced).
ALTER TABLE "SmallGroup" ADD COLUMN IF NOT EXISTS "parentSatellite" TEXT;
