-- The setup checklist's "registration form is configured" signal becomes an
-- explicit stamp instead of something inferred from the row's contents.
--
-- Two inferences were tried and both were wrong:
--
--   1. Row existence. Broke when 20260804000000_add_form_field_nickname
--      backfilled a Register and a WalkIn row for every event that had none —
--      the step then read as done for the entire back catalogue.
--   2. "Is any admin-intent toggle on?" Correct on the way up, wrong on the way
--      back down: an admin who switched their last toggle off saw the step
--      un-tick and the checklist re-open. Being through the builder and choosing
--      to ask for nothing extra is still having configured the form.
--
-- `configuredAt` is written only by the save paths in form-config-actions.ts.
-- No migration ever sets it going forward, which is what makes a non-null value
-- proof that a person did this.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "configuredAt" TIMESTAMP(3);

-- Backfill so nothing regresses on deploy: every row that satisfies today's
-- toggle test keeps counting as configured. The column list is
-- ADMIN_INTENT_TOGGLE_KEYS from lib/forms/context-config.ts — every toggle
-- except `fieldNickname` (migration-written) and the identity fields
-- `fieldMobile` / `fieldEmail` (default true, so on without anyone choosing).
--
-- `updatedAt` rather than NOW() because it is the closest thing on the row to
-- when the admin actually made the change.
--
-- `"configuredAt" IS NULL` keeps this idempotent — a retry cannot overwrite a
-- stamp a real save has since written.
UPDATE "EventFormConfig"
SET "configuredAt" = "updatedAt"
WHERE "configuredAt" IS NULL
  AND (
       "sectionSmallGroup"      = true
    OR "sectionBreakout"        = true
    OR "sectionDietary"         = true
    OR "sectionPayment"         = true
    OR "sectionFamily"          = true
    OR "familySpouseOnly"       = true
    OR "fieldLifeStage"         = true
    OR "fieldGender"            = true
    OR "fieldBirthDate"         = true
    OR "fieldAgeRange"          = true
    OR "fieldWorkCity"          = true
    OR "fieldLanguage"          = true
    OR "fieldSchedule"          = true
    OR "fieldMeetingPreference" = true
    OR "successMessage" IS NOT NULL
  );
