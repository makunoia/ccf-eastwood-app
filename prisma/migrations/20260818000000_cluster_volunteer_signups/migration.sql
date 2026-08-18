-- Event-day volunteer sign-ups.
--
-- `Volunteer.signUpClusterId` is provenance, mirroring
-- `EventRegistrant.registrationClusterId`: the row stays owned by the event the
-- person signed up under, and this records that the sign-up came in through an
-- event day's shared volunteer form. A Collab day needs it to answer "who
-- volunteered for this day" at all — without it the day can only show the union
-- of its member events' standing rosters.
--
-- `EventCluster.volunteerIsOpen` is the day's fourth open/close switch, next to
-- the shared form, the door and the kiosk.
--
-- Written idempotently (project convention) so a partially-applied run is safe
-- to retry.

ALTER TABLE "EventCluster" ADD COLUMN IF NOT EXISTS "volunteerIsOpen" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Volunteer" ADD COLUMN IF NOT EXISTS "signUpClusterId" TEXT;

CREATE INDEX IF NOT EXISTS "Volunteer_signUpClusterId_idx" ON "Volunteer"("signUpClusterId");

DO $$ BEGIN
  ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_signUpClusterId_fkey"
    FOREIGN KEY ("signUpClusterId") REFERENCES "EventCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
