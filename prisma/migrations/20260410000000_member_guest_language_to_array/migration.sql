-- AlterTable Member: language String? -> String[]
-- Preserve existing data: wrap single value in array, null becomes empty array
ALTER TABLE "Member"
  ALTER COLUMN "language" TYPE TEXT[]
  USING CASE WHEN "language" IS NULL THEN '{}'::TEXT[] ELSE ARRAY["language"]::TEXT[] END;
ALTER TABLE "Member" ALTER COLUMN "language" SET NOT NULL;
ALTER TABLE "Member" ALTER COLUMN "language" SET DEFAULT '{}';

-- AlterTable Guest: language String? -> String[]
ALTER TABLE "Guest"
  ALTER COLUMN "language" TYPE TEXT[]
  USING CASE WHEN "language" IS NULL THEN '{}'::TEXT[] ELSE ARRAY["language"]::TEXT[] END;
ALTER TABLE "Guest" ALTER COLUMN "language" SET NOT NULL;
ALTER TABLE "Guest" ALTER COLUMN "language" SET DEFAULT '{}';
