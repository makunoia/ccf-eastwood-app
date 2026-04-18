-- Remove scheduleTimeEnd from SmallGroup.
-- Schedule is now a single day + time, not a range.

ALTER TABLE "SmallGroup" DROP COLUMN IF EXISTS "scheduleTimeEnd";
