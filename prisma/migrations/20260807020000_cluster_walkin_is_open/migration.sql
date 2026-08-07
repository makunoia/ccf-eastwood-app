-- The cluster day's door form gets its own open/close switch (CCF-133).
--
-- Until now the cluster walk-in ignored `EventCluster.isOpen` entirely — it was
-- the shared form plus `?checkin=1`, exempt from every gate. Now that it has its
-- own route it needs its own switch, so closing the shared form the night before
-- doesn't close the door with it.
--
-- Defaults to false, like `isOpen` beside it: a standalone URL that registers and
-- records attendance in one submit waits to be opened for the day. Existing
-- clusters are therefore closed on deploy — deliberate, and covered by the
-- release note.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "EventCluster"
  ADD COLUMN IF NOT EXISTS "walkInIsOpen" BOOLEAN NOT NULL DEFAULT false;
