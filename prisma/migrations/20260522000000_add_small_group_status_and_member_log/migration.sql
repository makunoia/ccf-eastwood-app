-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SmallGroupStatus" AS ENUM ('Active', 'Pending', 'Inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add status to SmallGroup
ALTER TABLE "SmallGroup" ADD COLUMN IF NOT EXISTS "status" "SmallGroupStatus" NOT NULL DEFAULT 'Active';

-- CreateTable: MemberLog
CREATE TABLE IF NOT EXISTS "MemberLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MemberLog" ADD CONSTRAINT "MemberLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MemberLog" ADD CONSTRAINT "MemberLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
