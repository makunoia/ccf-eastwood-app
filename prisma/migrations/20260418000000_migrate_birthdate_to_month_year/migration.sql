-- Migration: Replace birthDate (DateTime) with birthMonth (Int) and birthYear (Int)
-- on both Member and Guest models.

-- Step 1: Add new columns
ALTER TABLE "Member" ADD COLUMN "birthMonth" INTEGER;
ALTER TABLE "Member" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "Guest" ADD COLUMN "birthMonth" INTEGER;
ALTER TABLE "Guest" ADD COLUMN "birthYear" INTEGER;

-- Step 2: Migrate existing data
UPDATE "Member" SET "birthMonth" = EXTRACT(MONTH FROM "birthDate"), "birthYear" = EXTRACT(YEAR FROM "birthDate") WHERE "birthDate" IS NOT NULL;
UPDATE "Guest" SET "birthMonth" = EXTRACT(MONTH FROM "birthDate"), "birthYear" = EXTRACT(YEAR FROM "birthDate") WHERE "birthDate" IS NOT NULL;

-- Step 3: Drop old column
ALTER TABLE "Member" DROP COLUMN "birthDate";
ALTER TABLE "Guest" DROP COLUMN "birthDate";
