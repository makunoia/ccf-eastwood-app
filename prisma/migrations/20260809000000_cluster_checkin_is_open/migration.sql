-- The cluster day gets a check-in kiosk, and the kiosk gets its own switch.
--
-- A cluster now has three public surfaces: the shared registration form
-- (`isOpen`), the door that registers and checks in (`walkInIsOpen`), and this —
-- a kiosk that only records attendance for people already registered. They open
-- and close on different schedules, so they can't share a switch. As with the
-- other two, clusters can't use FormConfig for this: that table is keyed by
-- eventId only.
--
-- Defaults to false, like the two beside it. A public URL that writes attendance
-- waits to be opened for the day, so existing clusters ship closed.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "EventCluster"
  ADD COLUMN IF NOT EXISTS "checkInIsOpen" BOOLEAN NOT NULL DEFAULT false;
