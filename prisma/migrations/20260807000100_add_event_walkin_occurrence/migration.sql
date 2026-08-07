-- The session the walk-in form registers people into (CCF-133).
--
-- The occurrence used to ride in the URL as `?checkin=<occurrenceId>`, so a stale
-- or hand-edited id reached the form and only failed on submit. It is now an
-- explicit admin choice on the Walk-in form config: null, or a session that is
-- closed, turns the walk-in form off rather than sending someone to the wrong day.
--
-- ON DELETE SET NULL is deliberate — deleting the chosen session clears the
-- pointer, which closes walk-in instead of leaving it aimed at a dead row.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "walkInOccurrenceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Event" ADD CONSTRAINT "Event_walkInOccurrenceId_fkey"
    FOREIGN KEY ("walkInOccurrenceId") REFERENCES "EventOccurrence"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Event_walkInOccurrenceId_idx" ON "Event"("walkInOccurrenceId");

-- Backfill so nothing closes on deploy. Walk-in was previously reachable for every
-- event, with the occurrence supplied by whichever check-in board linked to it —
-- in practice the open one. Point each existing event at its open session so the
-- door keeps working, and let admins re-point it from the Walk-in form config.
--
-- Events with no open session get NULL, which turns walk-in off. That is correct:
-- there was nothing to check anyone into there anyway.
--
-- `walkInOccurrenceId IS NULL` keeps this idempotent — a retry cannot overwrite a
-- choice an admin has since made.
UPDATE "Event" e
SET "walkInOccurrenceId" = (
  SELECT o."id"
  FROM "EventOccurrence" o
  WHERE o."eventId" = e."id" AND o."isOpen" = true
  ORDER BY o."date" DESC
  LIMIT 1
)
WHERE e."type" <> 'OneTime' AND e."walkInOccurrenceId" IS NULL;
