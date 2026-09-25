ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "customSteps" JSONB;
ALTER TABLE "EventRegistrant" ADD COLUMN IF NOT EXISTS "customResponses" JSONB;
