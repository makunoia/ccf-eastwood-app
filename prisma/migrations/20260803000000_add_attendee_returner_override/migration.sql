-- Admin override for the derived New/Returning badge on the session detail page.
-- null = derive from prior attendance, true = force "Returning", false = force "New".
ALTER TABLE "OccurrenceAttendee" ADD COLUMN IF NOT EXISTS "isReturnerOverride" BOOLEAN;
