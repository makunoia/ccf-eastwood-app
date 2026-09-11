-- A recurring event can now join multiple collab days. Preserve every day's
-- registration and volunteer provenance instead of overwriting one nullable FK.
CREATE TABLE IF NOT EXISTS "EventRegistrantClusterParticipation" (
  "eventRegistrantId" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRegistrantClusterParticipation_pkey" PRIMARY KEY ("eventRegistrantId", "clusterId")
);

CREATE TABLE IF NOT EXISTS "VolunteerClusterParticipation" (
  "volunteerId" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VolunteerClusterParticipation_pkey" PRIMARY KEY ("volunteerId", "clusterId")
);

CREATE INDEX IF NOT EXISTS "EventRegistrantClusterParticipation_clusterId_idx"
  ON "EventRegistrantClusterParticipation"("clusterId");
CREATE INDEX IF NOT EXISTS "VolunteerClusterParticipation_clusterId_idx"
  ON "VolunteerClusterParticipation"("clusterId");

DO $$ BEGIN
  ALTER TABLE "EventRegistrantClusterParticipation" ADD CONSTRAINT "EventRegistrantClusterParticipation_eventRegistrantId_fkey"
    FOREIGN KEY ("eventRegistrantId") REFERENCES "EventRegistrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventRegistrantClusterParticipation" ADD CONSTRAINT "EventRegistrantClusterParticipation_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VolunteerClusterParticipation" ADD CONSTRAINT "VolunteerClusterParticipation_volunteerId_fkey"
    FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VolunteerClusterParticipation" ADD CONSTRAINT "VolunteerClusterParticipation_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "EventRegistrantClusterParticipation" ("eventRegistrantId", "clusterId")
SELECT "id", "registrationClusterId" FROM "EventRegistrant" WHERE "registrationClusterId" IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO "VolunteerClusterParticipation" ("volunteerId", "clusterId")
SELECT "id", "signUpClusterId" FROM "Volunteer" WHERE "signUpClusterId" IS NOT NULL
ON CONFLICT DO NOTHING;
