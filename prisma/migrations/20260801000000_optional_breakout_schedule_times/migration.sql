-- Meeting schedule start/end times are optional everywhere. SmallGroup already
-- stores them as nullable inline columns; BreakoutGroupSchedule required a
-- start time, which blocked day-only breakout schedules.
ALTER TABLE "BreakoutGroupSchedule" ALTER COLUMN "timeStart" DROP NOT NULL;
