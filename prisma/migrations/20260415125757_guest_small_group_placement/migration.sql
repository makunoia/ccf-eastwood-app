/*
  Warnings:

  - You are about to drop the `GroupMeetingSchedule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GroupMeetingSchedule" DROP CONSTRAINT "GroupMeetingSchedule_smallGroupId_fkey";

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "claimedSmallGroupId" TEXT,
ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleTimeEnd" TEXT,
ADD COLUMN     "scheduleTimeStart" TEXT;

-- AlterTable
ALTER TABLE "SmallGroup" ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleTimeEnd" TEXT,
ADD COLUMN     "scheduleTimeStart" TEXT;

-- DropTable
DROP TABLE "GroupMeetingSchedule";

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_claimedSmallGroupId_fkey" FOREIGN KEY ("claimedSmallGroupId") REFERENCES "SmallGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
