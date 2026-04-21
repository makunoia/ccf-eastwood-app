-- Delete all records without an eventId before enforcing NOT NULL
-- First remove volunteers that belong to committees with no eventId
DELETE FROM "Volunteer" WHERE "committeeId" IN (SELECT "id" FROM "VolunteerCommittee" WHERE "eventId" IS NULL);
-- Then remove any remaining volunteers without an eventId
DELETE FROM "Volunteer" WHERE "eventId" IS NULL;
-- Finally remove committees without an eventId
DELETE FROM "VolunteerCommittee" WHERE "eventId" IS NULL;

-- (Prisma-generated ALTER TABLE statements follow below)

-- AlterTable
ALTER TABLE "Volunteer" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VolunteerCommittee" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;
