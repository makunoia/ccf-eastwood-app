-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "FamilyRole" AS ENUM ('Father', 'Mother', 'Child', 'Guardian', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "memberId" TEXT,
    "guestId" TEXT,
    "role" "FamilyRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyMember_familyId_memberId_key" ON "FamilyMember"("familyId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyMember_familyId_guestId_key" ON "FamilyMember"("familyId", "guestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FamilyMember_memberId_idx" ON "FamilyMember"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FamilyMember_guestId_idx" ON "FamilyMember"("guestId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_guestId_fkey"
    FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
