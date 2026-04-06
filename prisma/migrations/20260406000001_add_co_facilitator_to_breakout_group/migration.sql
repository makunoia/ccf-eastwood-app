-- AlterTable
ALTER TABLE "BreakoutGroup" ADD COLUMN "coFacilitatorId" TEXT;

-- AddForeignKey
ALTER TABLE "BreakoutGroup" ADD CONSTRAINT "BreakoutGroup_coFacilitatorId_fkey" FOREIGN KEY ("coFacilitatorId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
