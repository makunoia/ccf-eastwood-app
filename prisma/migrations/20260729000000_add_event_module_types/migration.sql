-- Volunteers / Breakout / Priced become toggleable event modules (CCF-128, CCF-131)
-- plus the church-wide ministry flag and the module-review stamp.
--
-- NOTE: Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a transaction, but the
-- new values cannot be *used* in the same transaction. The backfill that inserts
-- EventModule rows of these types therefore lives in the next migration.

ALTER TYPE "EventModuleType" ADD VALUE IF NOT EXISTS 'Volunteers';
ALTER TYPE "EventModuleType" ADD VALUE IF NOT EXISTS 'Breakout';
ALTER TYPE "EventModuleType" ADD VALUE IF NOT EXISTS 'Priced';

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "allMinistries" BOOLEAN NOT NULL DEFAULT false;
