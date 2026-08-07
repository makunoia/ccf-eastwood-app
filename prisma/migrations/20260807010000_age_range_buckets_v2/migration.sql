-- CCF-144: replace the six 18-and-up Age Range bands seeded by
-- `20260727010000_add_age_range_bucket` with ten bands running from "Under 13"
-- to "90+".
--
-- The intended shape is mirrored in `lib/constants/age-range-buckets.ts`
-- (DEFAULT_AGE_RANGE_BUCKETS + LEGACY_AGE_RANGE_REMAP); the integration test
-- compares the real post-migration table against it, so the two can't drift
-- silently. Keep them in step when editing either.
--
-- Delivered as a migration rather than a manual Settings edit so preview and
-- prod converge. Written idempotently per CLAUDE.md: every step is either
-- conflict-tolerant or a no-op on a second run.

-- ── 1. The ten new bands ────────────────────────────────────────────────────
-- Conflict-do-nothing on label, so a re-run (or a band an admin already created
-- by hand) is left exactly as it is.
INSERT INTO "AgeRangeBucket" ("id", "label", "minAge", "maxAge", "order", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Under 13', NULL, 12,   1,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '13–20',    13,   20,   2,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '21–30',    21,   30,   3,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '31–40',    31,   40,   4,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '41–50',    41,   50,   5,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '51–60',    51,   60,   6,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '61–70',    61,   70,   7,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '71–80',    71,   80,   8,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '81–89',    81,   89,   9,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '90+',      90,   NULL, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;

-- ── 2. Move everyone off the retired bands ──────────────────────────────────
-- Each old band maps to the new one it overlaps most. Both sub-selects are
-- label-keyed, so a missing band on either side makes the UPDATE match nothing
-- rather than fail — which is also what makes step 3 safe to reach.
DO $$
DECLARE
  remap CONSTANT text[][] := ARRAY[
    ['Under 18', 'Under 13'],
    ['18 – 29',  '21–30'],
    ['30 – 39',  '31–40'],
    ['40 – 49',  '41–50'],
    ['50 – 59',  '51–60'],
    ['60+',      '61–70']
  ];
  pair text[];
  old_id text;
  new_id text;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY remap LOOP
    SELECT "id" INTO old_id FROM "AgeRangeBucket" WHERE "label" = pair[1];
    SELECT "id" INTO new_id FROM "AgeRangeBucket" WHERE "label" = pair[2];
    CONTINUE WHEN old_id IS NULL OR new_id IS NULL;

    UPDATE "Member" SET "ageRangeBucketId" = new_id WHERE "ageRangeBucketId" = old_id;
    UPDATE "Guest"  SET "ageRangeBucketId" = new_id WHERE "ageRangeBucketId" = old_id;
  END LOOP;
END $$;

-- ── 3. Retire the old bands ─────────────────────────────────────────────────
-- Step 2 has already moved every reference; the ON DELETE SET NULL on
-- Member/Guest is only a backstop for a bucket an admin created themselves.
DELETE FROM "AgeRangeBucket"
WHERE "label" IN ('Under 18', '18 – 29', '30 – 39', '40 – 49', '50 – 59', '60+');

-- ── 4. Pin the display order ────────────────────────────────────────────────
-- Separate from the INSERT so a band that already existed (conflict-do-nothing
-- above) still sorts into the right slot.
UPDATE "AgeRangeBucket" AS b
SET "order" = v."order", "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('Under 13', 1),
  ('13–20',    2),
  ('21–30',    3),
  ('31–40',    4),
  ('41–50',    5),
  ('51–60',    6),
  ('61–70',    7),
  ('71–80',    8),
  ('81–89',    9),
  ('90+',      10)
) AS v("label", "order")
WHERE b."label" = v."label" AND b."order" IS DISTINCT FROM v."order";
