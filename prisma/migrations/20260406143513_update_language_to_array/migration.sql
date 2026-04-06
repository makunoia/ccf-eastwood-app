/*
  Warnings:

  - The `language` column on the `BreakoutGroup` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `language` column on the `SmallGroup` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "BreakoutGroup" DROP COLUMN "language",
ADD COLUMN     "language" TEXT[];

-- AlterTable
ALTER TABLE "BreakoutGroupSchedule" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GroupMeetingSchedule" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SchedulePreference" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SmallGroup" DROP COLUMN "language",
ADD COLUMN     "language" TEXT[];
