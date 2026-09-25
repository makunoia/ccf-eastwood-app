ALTER TABLE "Event"
ADD COLUMN IF NOT EXISTS "customRegistrationSteps" JSONB;

-- Merge the formerly independent Register and Walk-in definitions. Each legacy
-- question becomes its own step; question IDs remain unchanged so existing
-- response snapshots continue to map to the active definition.
WITH legacy_steps AS (
  SELECT
    config."eventId",
    config.context,
    step.value AS step,
    step.ordinality AS step_order
  FROM "EventFormConfig" AS config
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(config."customSteps"::jsonb) = 'array'
      THEN config."customSteps"::jsonb ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS step(value, ordinality)
  WHERE config."eventId" IS NOT NULL
    AND config.context IN ('Register', 'WalkIn')
), legacy_questions AS (
  SELECT
    legacy_steps."eventId",
    legacy_steps.context,
    legacy_steps.step,
    legacy_steps.step_order,
    question.value AS question,
    question.ordinality AS question_order
  FROM legacy_steps
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(legacy_steps.step->'questions') = 'array'
      THEN legacy_steps.step->'questions' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS question(value, ordinality)
  WHERE question.value ? 'id'
), deduplicated_questions AS (
  SELECT *, row_number() OVER (
    PARTITION BY "eventId", question->>'id'
    ORDER BY CASE WHEN context = 'Register' THEN 0 ELSE 1 END,
      step_order, question_order
  ) AS question_rank
  FROM legacy_questions
), migrated AS (
  SELECT
    "eventId",
    jsonb_agg(
      jsonb_build_object(
        'id', 'step-' || md5("eventId" || ':' || (question->>'id')),
        'title', CASE
          WHEN jsonb_array_length(COALESCE(step->'questions', '[]'::jsonb)) > 1
            THEN left(COALESCE(step->>'title', 'Custom step'), 68) || ' — ' || left(COALESCE(question->>'label', 'Question'), 26)
          ELSE COALESCE(step->>'title', question->>'label', 'Custom step')
        END,
        'questions', jsonb_build_array(question)
      ) ORDER BY CASE WHEN context = 'Register' THEN 0 ELSE 1 END,
        step_order, question_order
    ) AS steps
  FROM deduplicated_questions
  WHERE question_rank = 1
  GROUP BY "eventId"
)
UPDATE "Event" AS event
SET "customRegistrationSteps" = migrated.steps
FROM migrated
WHERE event.id = migrated."eventId"
  AND event."customRegistrationSteps" IS NULL;

UPDATE "Event"
SET "customRegistrationSteps" = '[]'::jsonb
WHERE "customRegistrationSteps" IS NULL;

ALTER TABLE "EventFormConfig"
DROP COLUMN IF EXISTS "customSteps";
