-- Rename FamilyRole enum values: Father -> FatherHusband, Mother -> MotherWife.
-- Data-preserving RENAME VALUE. Guarded so a retry after a partial apply is a no-op.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'FamilyRole' AND e.enumlabel = 'Father'
  ) THEN
    ALTER TYPE "FamilyRole" RENAME VALUE 'Father' TO 'FatherHusband';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'FamilyRole' AND e.enumlabel = 'Mother'
  ) THEN
    ALTER TYPE "FamilyRole" RENAME VALUE 'Mother' TO 'MotherWife';
  END IF;
END $$;
