-- CCF-130: per-(event|cluster, context) override for the registration success
-- screen's sub copy. NULL keeps the built-in default.
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "successMessage" TEXT;
