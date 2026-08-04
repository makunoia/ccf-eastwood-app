-- Nickname becomes a configurable Personal Information field.
--
-- It used to render unconditionally on the Register / Walk-in form, so every
-- event and cluster that exists at migration time is backfilled to keep asking
-- for it; only events created afterwards start with it off, in line with the
-- "bare by default" model every other field follows. Check-in never rendered a
-- nickname input, so its rows stay false.
--
-- The whole backfill is nested inside the "column does not exist yet" guard so a
-- retry after a partial failure can't resurrect a toggle an admin has since
-- switched off.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'EventFormConfig' AND column_name = 'fieldNickname'
  ) THEN
    ALTER TABLE "EventFormConfig"
      ADD COLUMN "fieldNickname" BOOLEAN NOT NULL DEFAULT false;

    -- Configured events/clusters: keep the field they are asking for today.
    UPDATE "EventFormConfig"
      SET "fieldNickname" = true
      WHERE "context" IN ('Register', 'WalkIn');

    -- Events with no stored config were bare *plus* the unconditional nickname
    -- input, so a row has to exist to express that. Everything else keeps its
    -- column default, which is exactly what a missing row already meant.
    INSERT INTO "EventFormConfig" ("id", "eventId", "context", "fieldNickname", "createdAt", "updatedAt")
    SELECT
      md5(random()::text || clock_timestamp()::text || e."id" || c."context"::text),
      e."id",
      c."context",
      true,
      NOW(),
      NOW()
    FROM "Event" e
    CROSS JOIN (VALUES ('Register'::"FormContext"), ('WalkIn'::"FormContext")) AS c("context")
    ON CONFLICT ("eventId", "context") DO NOTHING;

    INSERT INTO "EventFormConfig" ("id", "clusterId", "context", "fieldNickname", "createdAt", "updatedAt")
    SELECT
      md5(random()::text || clock_timestamp()::text || cl."id" || c."context"::text),
      cl."id",
      c."context",
      true,
      NOW(),
      NOW()
    FROM "EventCluster" cl
    CROSS JOIN (VALUES ('Register'::"FormContext"), ('WalkIn'::"FormContext")) AS c("context")
    ON CONFLICT ("clusterId", "context") DO NOTHING;
  END IF;
END $$;
