-- DropForeignKey
ALTER TABLE "CatchMechComment" DROP CONSTRAINT IF EXISTS "CatchMechComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "CatchMechComment" DROP CONSTRAINT IF EXISTS "CatchMechComment_requestId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_brandMinistryId_fkey";

-- DropForeignKey
ALTER TABLE "OccurrenceSubFacilitator" DROP CONSTRAINT IF EXISTS "OccurrenceSubFacilitator_breakoutGroupId_fkey";

-- DropForeignKey
ALTER TABLE "OccurrenceSubFacilitator" DROP CONSTRAINT IF EXISTS "OccurrenceSubFacilitator_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "OccurrenceSubFacilitator" DROP CONSTRAINT IF EXISTS "OccurrenceSubFacilitator_substituteId_fkey";

-- DropForeignKey
ALTER TABLE "SmallGroup" DROP CONSTRAINT IF EXISTS "SmallGroup_leaderId_fkey";

-- DropForeignKey
ALTER TABLE "Volunteer" DROP CONSTRAINT IF EXISTS "Volunteer_eventId_fkey";

-- DropForeignKey
ALTER TABLE "VolunteerCommittee" DROP CONSTRAINT IF EXISTS "VolunteerCommittee_eventId_fkey";

-- AlterTable
ALTER TABLE "EventOccurrence" ADD COLUMN IF NOT EXISTS "isStandalone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seriesId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EventOccurrenceSeries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrenceSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventOccurrenceSeries_eventId_startDate_endDate_idx" ON "EventOccurrenceSeries"("eventId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventOccurrence_seriesId_idx" ON "EventOccurrence"("seriesId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SmallGroup" ADD CONSTRAINT "SmallGroup_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventOccurrenceSeries" ADD CONSTRAINT "EventOccurrenceSeries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventOccurrenceSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator" ADD CONSTRAINT "OccurrenceSubFacilitator_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator" ADD CONSTRAINT "OccurrenceSubFacilitator_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OccurrenceSubFacilitator" ADD CONSTRAINT "OccurrenceSubFacilitator_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VolunteerCommittee" ADD CONSTRAINT "VolunteerCommittee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CatchMechComment" ADD CONSTRAINT "CatchMechComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SmallGroupMemberRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CatchMechComment" ADD CONSTRAINT "CatchMechComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
