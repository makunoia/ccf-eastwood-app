-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN "leaderApprovalToken" TEXT;
ALTER TABLE "Volunteer" ADD COLUMN "leaderNotes" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_leaderApprovalToken_key" ON "Volunteer"("leaderApprovalToken");
