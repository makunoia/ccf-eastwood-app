-- Ministry branding columns
ALTER TABLE "Ministry"
  ADD COLUMN IF NOT EXISTS "logoUrl"             TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorPrimary"   TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorSecondary" TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorAccent"    TEXT;

-- Event branding + form-module columns
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "useMinistryBrand"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "brandMinistryId"        TEXT,
  ADD COLUMN IF NOT EXISTS "logoUrl"                TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorPrimary"      TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorSecondary"    TEXT,
  ADD COLUMN IF NOT EXISTS "themeColorAccent"       TEXT,
  ADD COLUMN IF NOT EXISTS "formIncludeSmallGroup"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "formIncludeDietary"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "formIncludePayment"     BOOLEAN NOT NULL DEFAULT false;

-- DietaryPreference enum + columns on EventRegistrant
DO $$ BEGIN
  CREATE TYPE "DietaryPreference" AS ENUM (
    'Vegetarian','Vegan','Halal','Kosher',
    'GlutenFree','DairyFree','NutFree','Pescatarian','Other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EventRegistrant"
  ADD COLUMN IF NOT EXISTS "dietaryPreference" "DietaryPreference",
  ADD COLUMN IF NOT EXISTS "dietaryOther"       TEXT;

-- CatchMechComment table
CREATE TABLE IF NOT EXISTS "CatchMechComment" (
  "id"        TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorId"  TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CatchMechComment_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (safe to re-add with IF NOT EXISTS via DO block)
DO $$ BEGIN
  ALTER TABLE "CatchMechComment"
    ADD CONSTRAINT "CatchMechComment_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SmallGroupMemberRequest"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CatchMechComment"
    ADD CONSTRAINT "CatchMechComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Event → Ministry FK for brandMinistryId
DO $$ BEGIN
  ALTER TABLE "Event"
    ADD CONSTRAINT "Event_brandMinistryId_fkey"
    FOREIGN KEY ("brandMinistryId") REFERENCES "Ministry"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
