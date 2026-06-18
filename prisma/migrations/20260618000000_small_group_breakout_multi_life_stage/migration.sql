-- Convert SmallGroup.lifeStage and BreakoutGroup.lifeStage from a single FK to a
-- many-to-many relation (implicit join tables). Existing single values are
-- backfilled into the join tables before the old columns are dropped.

-- ── Join tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_SmallGroupLifeStages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SmallGroupLifeStages_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE IF NOT EXISTS "_BreakoutGroupLifeStages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BreakoutGroupLifeStages_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX IF NOT EXISTS "_SmallGroupLifeStages_B_index" ON "_SmallGroupLifeStages"("B");
CREATE INDEX IF NOT EXISTS "_BreakoutGroupLifeStages_B_index" ON "_BreakoutGroupLifeStages"("B");

-- _SmallGroupLifeStages: A = LifeStage.id, B = SmallGroup.id
DO $$ BEGIN
  ALTER TABLE "_SmallGroupLifeStages" ADD CONSTRAINT "_SmallGroupLifeStages_A_fkey"
    FOREIGN KEY ("A") REFERENCES "LifeStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "_SmallGroupLifeStages" ADD CONSTRAINT "_SmallGroupLifeStages_B_fkey"
    FOREIGN KEY ("B") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- _BreakoutGroupLifeStages: A = BreakoutGroup.id, B = LifeStage.id
DO $$ BEGIN
  ALTER TABLE "_BreakoutGroupLifeStages" ADD CONSTRAINT "_BreakoutGroupLifeStages_A_fkey"
    FOREIGN KEY ("A") REFERENCES "BreakoutGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "_BreakoutGroupLifeStages" ADD CONSTRAINT "_BreakoutGroupLifeStages_B_fkey"
    FOREIGN KEY ("B") REFERENCES "LifeStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Backfill existing single life-stage values (guard on old column existence) ─
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SmallGroup' AND column_name = 'lifeStageId'
  ) THEN
    INSERT INTO "_SmallGroupLifeStages" ("A", "B")
    SELECT "lifeStageId", "id" FROM "SmallGroup" WHERE "lifeStageId" IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BreakoutGroup' AND column_name = 'lifeStageId'
  ) THEN
    INSERT INTO "_BreakoutGroupLifeStages" ("A", "B")
    SELECT "id", "lifeStageId" FROM "BreakoutGroup" WHERE "lifeStageId" IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── Drop old single-FK columns ───────────────────────────────────────────────
ALTER TABLE "SmallGroup" DROP CONSTRAINT IF EXISTS "SmallGroup_lifeStageId_fkey";
ALTER TABLE "SmallGroup" DROP COLUMN IF EXISTS "lifeStageId";

ALTER TABLE "BreakoutGroup" DROP CONSTRAINT IF EXISTS "BreakoutGroup_lifeStageId_fkey";
ALTER TABLE "BreakoutGroup" DROP COLUMN IF EXISTS "lifeStageId";
