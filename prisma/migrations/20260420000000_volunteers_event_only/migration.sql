-- Delete ministry-scoped volunteer records before removing columns
DELETE FROM "Volunteer" WHERE "ministryId" IS NOT NULL AND "eventId" IS NULL;
DELETE FROM "VolunteerCommittee" WHERE "ministryId" IS NOT NULL AND "eventId" IS NULL;

-- (Prisma-generated ALTER TABLE statements follow below)

-- AlterTable
ALTER TABLE "Volunteer" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VolunteerCommittee" DROP COLUMN "ministryId",
ALTER COLUMN "eventId" SET NOT NULL;
