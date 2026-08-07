-- CCF-142: mobile and email become configurable fields, and every field gains an
-- independent Required flag.
--
-- Mobile/email default TRUE so Postgres backfills every existing row to the
-- behaviour it already had (both were hardcoded always-on before this). Required
-- defaults FALSE, so nothing becomes mandatory until an admin says so.
--
-- Written idempotently per CLAUDE.md.

ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldMobile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldEmail"  BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldNicknameRequired"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldMobileRequired"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldEmailRequired"             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldLifeStageRequired"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldGenderRequired"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldBirthDateRequired"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldAgeRangeRequired"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldWorkCityRequired"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldLanguageRequired"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldScheduleRequired"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "fieldMeetingPreferenceRequired" BOOLEAN NOT NULL DEFAULT false;
