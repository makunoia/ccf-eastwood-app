-- AlterTable: add linkedSmallGroupId to BreakoutGroup
ALTER TABLE "BreakoutGroup" ADD COLUMN "linkedSmallGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "BreakoutGroup" ADD CONSTRAINT "BreakoutGroup_linkedSmallGroupId_fkey"
  FOREIGN KEY ("linkedSmallGroupId") REFERENCES "SmallGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add breakoutGroupId to SmallGroupMemberRequest (plain string, no FK)
ALTER TABLE "SmallGroupMemberRequest" ADD COLUMN "breakoutGroupId" TEXT;
