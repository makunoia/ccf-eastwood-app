-- "Spouse-only" family capture tier: narrows Family mode to a single spouse
-- sub-form instead of the full repeatable household. The three tiers are
-- expressed as: sectionFamily off (Off) / sectionFamily + familySpouseOnly
-- (Spouse-only) / sectionFamily alone (Full household).
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "familySpouseOnly" BOOLEAN NOT NULL DEFAULT false;
