-- CreateEnum: MemberGroupStatus replaces the editable SmallGroupStatus table
CREATE TYPE "MemberGroupStatus" AS ENUM ('Member', 'Timothy', 'Leader');

-- CreateEnum: CatchMech module type
ALTER TYPE "EventModuleType" ADD VALUE 'CatchMech';

-- AlterTable Member: replace SmallGroupStatus FK with native enum column
ALTER TABLE "Member" ADD COLUMN "groupStatus" "MemberGroupStatus";

-- Backfill: map existing status names to native enum values
UPDATE "Member" m
SET "groupStatus" = CASE s.name
  WHEN 'Timothy' THEN 'Timothy'::"MemberGroupStatus"
  WHEN 'Leader'  THEN 'Leader'::"MemberGroupStatus"
  ELSE 'Member'::"MemberGroupStatus"
END
FROM "SmallGroupStatus" s
WHERE m."smallGroupStatusId" = s.id
  AND m."smallGroupStatusId" IS NOT NULL;

-- Drop old FK column
ALTER TABLE "Member" DROP COLUMN "smallGroupStatusId";

-- Drop SmallGroupStatus table
DROP TABLE "SmallGroupStatus";

-- CreateTable: CatchMechSession
CREATE TABLE "CatchMechSession" (
  "id"                     TEXT NOT NULL,
  "token"                  TEXT NOT NULL,
  "eventId"                TEXT NOT NULL,
  "breakoutGroupId"        TEXT NOT NULL,
  "facilitatorVolunteerId" TEXT NOT NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatchMechSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatchMechSession_token_key" ON "CatchMechSession"("token");

-- AddForeignKey
ALTER TABLE "CatchMechSession" ADD CONSTRAINT "CatchMechSession_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatchMechSession" ADD CONSTRAINT "CatchMechSession_breakoutGroupId_fkey"
  FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatchMechSession" ADD CONSTRAINT "CatchMechSession_facilitatorVolunteerId_fkey"
  FOREIGN KEY ("facilitatorVolunteerId") REFERENCES "Volunteer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
