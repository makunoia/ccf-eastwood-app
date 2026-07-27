-- Admin-configurable Age Range buckets: a global taxonomy managed in Settings,
-- the same way Life Stages are. Offered on registration forms as a coarser
-- alternative to Birth Month+Year. Birth Year remains the matching engine's
-- source of truth; a bucket is only consulted when birth year is absent.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

CREATE TABLE IF NOT EXISTS "AgeRangeBucket" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeRangeBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgeRangeBucket_label_key" ON "AgeRangeBucket"("label");

ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "ageRangeBucketId" TEXT;
ALTER TABLE "Guest"  ADD COLUMN IF NOT EXISTS "ageRangeBucketId" TEXT;

CREATE INDEX IF NOT EXISTS "Member_ageRangeBucketId_idx" ON "Member"("ageRangeBucketId");
CREATE INDEX IF NOT EXISTS "Guest_ageRangeBucketId_idx" ON "Guest"("ageRangeBucketId");

DO $$ BEGIN
  ALTER TABLE "Member" ADD CONSTRAINT "Member_ageRangeBucketId_fkey"
    FOREIGN KEY ("ageRangeBucketId") REFERENCES "AgeRangeBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Guest" ADD CONSTRAINT "Guest_ageRangeBucketId_fkey"
    FOREIGN KEY ("ageRangeBucketId") REFERENCES "AgeRangeBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Default seed: 10-year buckets with 18 as the floor ──────────────────────
-- Open-ended at both ends (null minAge = "and under", null maxAge = "and over").
-- Seeded on label conflict-do-nothing so re-running is safe and so an admin who
-- has already renamed or removed buckets doesn't get them resurrected wholesale.
INSERT INTO "AgeRangeBucket" ("id", "label", "minAge", "maxAge", "order", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Under 18', NULL, 17,   1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '18 – 29',  18,   29,   2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '30 – 39',  30,   39,   3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '40 – 49',  40,   49,   4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '50 – 59',  50,   59,   5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '60+',      60,   NULL, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;
