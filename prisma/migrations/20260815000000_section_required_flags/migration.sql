-- Per-section Required flags.
--
-- Only Dietary and Payment get one: they are the two sections that own a single
-- stored answer (`dietaryPreference`, `paymentReference`) that is either given or
-- blank. Breakout can be satisfied by auto-assign, an empty household is a
-- legitimate answer, and the DGroup step already makes you answer its intent.
--
-- Idempotent per the project convention, so a partial run can be retried without
-- tripping P3018.
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "sectionDietaryRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "sectionPaymentRequired" BOOLEAN NOT NULL DEFAULT false;
