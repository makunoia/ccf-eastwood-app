-- Drop timeEnd from BreakoutGroupSchedule (one time, not a range)
ALTER TABLE "BreakoutGroupSchedule" DROP COLUMN IF EXISTS "timeEnd";

-- Drop scheduleTimeEnd from Guest (mirrors SmallGroup pattern)
ALTER TABLE "Guest" DROP COLUMN IF EXISTS "scheduleTimeEnd";

-- Drop timeEnd from SchedulePreference (Member schedule preferences)
ALTER TABLE "SchedulePreference" DROP COLUMN IF EXISTS "timeEnd";
