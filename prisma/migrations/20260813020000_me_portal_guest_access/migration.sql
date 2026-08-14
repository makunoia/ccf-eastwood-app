-- The /me portal now asks "who is your leader?" before it lets anyone add a group
-- they lead, and it lets guests in to answer it. Two columns make that possible.
--
-- Member.upwardSatellite is the member-level twin of Guest.claimedSatellite. The
-- answer "my leader is at another CCF satellite" used to live only on
-- SmallGroup.parentSatellite, which meant it could not be recorded until the
-- member already led a group — exactly backwards from the order we now ask in.
--
-- Guest.selfServiceToken mirrors Member.selfServiceToken so the guest's step of
-- the portal has a refresh-safe URL before promotion turns them into a Member.

ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "upwardSatellite" TEXT;

ALTER TABLE "Guest" ADD COLUMN IF NOT EXISTS "selfServiceToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Guest_selfServiceToken_key" ON "Guest"("selfServiceToken");
