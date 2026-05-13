-- Rename column
ALTER TABLE "Event" RENAME COLUMN "formIncludeManualBreakout" TO "autoAssignBreakout";

-- Flip semantics:
--   old true  (admin let user pick at walk-in)  → new false (still let user pick)
--   old false (silent auto-assign at walk-in)   → new true  (still auto-assign)
UPDATE "Event" SET "autoAssignBreakout" = NOT "autoAssignBreakout";
