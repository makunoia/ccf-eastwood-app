-- Optional, event-scoped profile fields used to filter the breakout facilitator pool.
ALTER TABLE "Volunteer" ADD COLUMN IF NOT EXISTS "ageGroup" TEXT;
ALTER TABLE "Volunteer" ADD COLUMN IF NOT EXISTS "lifeStageId" TEXT;

-- Carry forward the profile already held by each volunteer's member record.
-- Age groups are intentionally fixed bands so breakout filters stay consistent.
UPDATE "Volunteer" AS v
SET
  "lifeStageId" = COALESCE(v."lifeStageId", m."lifeStageId"),
  "ageGroup" = COALESCE(v."ageGroup", CASE
    WHEN m."birthYear" IS NULL THEN NULL
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::INT - m."birthYear" - CASE WHEN m."birthMonth" IS NOT NULL AND EXTRACT(MONTH FROM CURRENT_DATE)::INT < m."birthMonth" THEN 1 ELSE 0 END <= 17 THEN 'Under 18'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::INT - m."birthYear" - CASE WHEN m."birthMonth" IS NOT NULL AND EXTRACT(MONTH FROM CURRENT_DATE)::INT < m."birthMonth" THEN 1 ELSE 0 END <= 24 THEN '18–24'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::INT - m."birthYear" - CASE WHEN m."birthMonth" IS NOT NULL AND EXTRACT(MONTH FROM CURRENT_DATE)::INT < m."birthMonth" THEN 1 ELSE 0 END <= 34 THEN '25–34'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::INT - m."birthYear" - CASE WHEN m."birthMonth" IS NOT NULL AND EXTRACT(MONTH FROM CURRENT_DATE)::INT < m."birthMonth" THEN 1 ELSE 0 END <= 49 THEN '35–49'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::INT - m."birthYear" - CASE WHEN m."birthMonth" IS NOT NULL AND EXTRACT(MONTH FROM CURRENT_DATE)::INT < m."birthMonth" THEN 1 ELSE 0 END <= 64 THEN '50–64'
    ELSE '65+'
  END)
FROM "Member" AS m
WHERE v."memberId" = m."id"
  AND (v."lifeStageId" IS NULL OR v."ageGroup" IS NULL);

CREATE INDEX IF NOT EXISTS "Volunteer_lifeStageId_idx" ON "Volunteer"("lifeStageId");

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "Volunteer" GROUP BY "memberId", "eventId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add the Volunteer member/event uniqueness constraint: duplicate volunteer rows exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Volunteer_memberId_eventId_key" ON "Volunteer"("memberId", "eventId");

DO $$ BEGIN
  ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_lifeStageId_fkey"
    FOREIGN KEY ("lifeStageId") REFERENCES "LifeStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
