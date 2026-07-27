-- Per-(event, context) registration form configuration: which sections and
-- fields the Register / Walk-in / Check-in surfaces collect, configured
-- independently per context. Replaces the flat Event.formInclude* booleans,
-- which applied to all three contexts at once.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

DO $$ BEGIN
  CREATE TYPE "FormContext" AS ENUM ('Register', 'WalkIn', 'CheckIn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventFormConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "context" "FormContext" NOT NULL,
    "sectionSmallGroup" BOOLEAN NOT NULL DEFAULT false,
    "sectionBreakout" BOOLEAN NOT NULL DEFAULT false,
    "sectionDietary" BOOLEAN NOT NULL DEFAULT false,
    "sectionPayment" BOOLEAN NOT NULL DEFAULT false,
    "sectionFamily" BOOLEAN NOT NULL DEFAULT false,
    "fieldLifeStage" BOOLEAN NOT NULL DEFAULT false,
    "fieldGender" BOOLEAN NOT NULL DEFAULT false,
    "fieldBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "fieldAgeRange" BOOLEAN NOT NULL DEFAULT false,
    "fieldWorkCity" BOOLEAN NOT NULL DEFAULT false,
    "fieldLanguage" BOOLEAN NOT NULL DEFAULT false,
    "fieldSchedule" BOOLEAN NOT NULL DEFAULT false,
    "fieldMeetingPreference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFormConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventFormConfig_eventId_context_key" ON "EventFormConfig"("eventId", "context");
CREATE INDEX IF NOT EXISTS "EventFormConfig_eventId_idx" ON "EventFormConfig"("eventId");

DO $$ BEGIN
  ALTER TABLE "EventFormConfig" ADD CONSTRAINT "EventFormConfig_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Existing events must keep their current live behavior. "Bare by default" is
-- the rule for NEW events only, so every event that exists at migration time
-- gets rows derived from its old flat toggles.
--
-- Legacy behavior being reproduced:
--   * Register and Walk-in rendered the SAME component with the SAME props
--     (walk-ins go through /events/[id]/register?checkin=…), so both contexts
--     map identically.
--   * Birth Month+Year and Gender were rendered unconditionally in Personal
--     Information → true for Register/Walk-in regardless of the toggles.
--   * The matching fields (Life Stage, Language, Meeting Preference, Work City,
--     Schedule) only ever appeared inside the DGroup section → they follow
--     formIncludeSmallGroup.
--   * Breakout selection had no toggle; it rendered whenever the event was NOT
--     in auto-assign mode and candidates existed → sectionBreakout =
--     NOT autoAssignBreakout. (Whether candidates exist stays a runtime check.)
--   * Check-in only ever surfaced the DGroup prompt + matching profile, gated on
--     formIncludeSmallGroup. It never collected dietary, payment, birthday, or
--     offered breakout selection → those stay false.
--   * Age Range and Family check-in did not exist yet → false everywhere.

INSERT INTO "EventFormConfig" (
    "id", "eventId", "context",
    "sectionSmallGroup", "sectionBreakout", "sectionDietary", "sectionPayment", "sectionFamily",
    "fieldLifeStage", "fieldGender", "fieldBirthDate", "fieldAgeRange",
    "fieldWorkCity", "fieldLanguage", "fieldSchedule", "fieldMeetingPreference",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    e."id",
    ctx.context,
    -- sections
    e."formIncludeSmallGroup",
    CASE WHEN ctx.context = 'CheckIn' THEN false ELSE NOT e."autoAssignBreakout" END,
    CASE WHEN ctx.context = 'CheckIn' THEN false ELSE e."formIncludeDietary" END,
    CASE WHEN ctx.context = 'CheckIn' THEN false ELSE e."formIncludePayment" END,
    false,
    -- fields
    e."formIncludeSmallGroup",
    CASE WHEN ctx.context = 'CheckIn' THEN e."formIncludeSmallGroup" ELSE true END,
    CASE WHEN ctx.context = 'CheckIn' THEN false ELSE true END,
    false,
    e."formIncludeSmallGroup",
    e."formIncludeSmallGroup",
    e."formIncludeSmallGroup",
    e."formIncludeSmallGroup",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Event" e
CROSS JOIN (
    VALUES ('Register'::"FormContext"), ('WalkIn'::"FormContext"), ('CheckIn'::"FormContext")
) AS ctx(context)
ON CONFLICT ("eventId", "context") DO NOTHING;
