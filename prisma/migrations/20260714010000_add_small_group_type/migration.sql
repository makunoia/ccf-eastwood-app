-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "SmallGroupType" AS ENUM ('Regular', 'Couples');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "SmallGroup" ADD COLUMN IF NOT EXISTS "groupType" "SmallGroupType" NOT NULL DEFAULT 'Regular';
