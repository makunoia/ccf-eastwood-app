DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Event'
      AND column_name = 'formIncludeManualBreakout'
  ) THEN
    ALTER TABLE "Event" RENAME COLUMN "formIncludeManualBreakout" TO "autoAssignBreakout";

    -- Flip semantics:
    --   old true  (admin let user pick at walk-in)  -> new false (still let user pick)
    --   old false (silent auto-assign at walk-in)   -> new true  (still auto-assign)
    UPDATE "Event" SET "autoAssignBreakout" = NOT "autoAssignBreakout";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Event'
      AND column_name = 'autoAssignBreakout'
  ) THEN
    ALTER TABLE "Event" ADD COLUMN "autoAssignBreakout" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
