-- CreateEnum
CREATE TYPE "SmallGroupStatus" AS ENUM ('New', 'Regular', 'Timothy', 'Leader');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "smallGroupStatus" "SmallGroupStatus";
