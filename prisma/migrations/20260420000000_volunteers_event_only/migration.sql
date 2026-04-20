-- Delete all records without an eventId before enforcing NOT NULL
-- First remove volunteers that belong to committees with no eventId
DELETE FROM "Volunteer" WHERE "committeeId" IN (SELECT "id" FROM "VolunteerCommittee" WHERE "eventId" IS NULL);
-- Then remove any remaining volunteers without an eventId
DELETE FROM "Volunteer" WHERE "eventId" IS NULL;
-- Finally remove committees without an eventId
DELETE FROM "VolunteerCommittee" WHERE "eventId" IS NULL;

-- Drop old FK constraints that use ON DELETE SET NULL (incompatible with NOT NULL columns)
ALTER TABLE "Volunteer" DROP CONSTRAINT IF EXISTS "Volunteer_eventId_fkey";
ALTER TABLE "Volunteer" DROP CONSTRAINT IF EXISTS "Volunteer_ministryId_fkey";
ALTER TABLE "VolunteerCommittee" DROP CONSTRAINT IF EXISTS "VolunteerCommittee_eventId_fkey";
ALTER TABLE "VolunteerCommittee" DROP CONSTRAINT IF EXISTS "VolunteerCommittee_ministryId_fkey";

-- AlterTable
ALTER TABLE "Volunteer" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VolunteerCommittee" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;

-- Re-add FK constraints with correct referential actions
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VolunteerCommittee" ADD CONSTRAINT "VolunteerCommittee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
