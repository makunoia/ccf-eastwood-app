-- Restore schedule end-time columns expected by the current Prisma schema.
-- Some environments applied older drop migrations, causing runtime P2022 errors.

ALTER TABLE "SmallGroup"
  ADD COLUMN IF NOT EXISTS "scheduleTimeEnd" TEXT;

ALTER TABLE "Guest"
  ADD COLUMN IF NOT EXISTS "scheduleTimeEnd" TEXT;

ALTER TABLE "SchedulePreference"
  ADD COLUMN IF NOT EXISTS "timeEnd" TEXT;

ALTER TABLE "BreakoutGroupSchedule"
  ADD COLUMN IF NOT EXISTS "timeEnd" TEXT;
