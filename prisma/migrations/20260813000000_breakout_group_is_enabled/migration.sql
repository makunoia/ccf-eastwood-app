-- A breakout group gets an off switch.
--
-- Until now a group had two states: it exists, or it's deleted. Taking one out
-- of play for a night — unstaffed, being rebuilt, facilitator dropped out —
-- meant deleting it and losing its roster and its linked DGroup with it. The
-- only "closed" signal that existed was derived from `memberLimit`, which is
-- capacity, not intent.
--
-- Off blocks new *intake* only: the registration picker, the walk-in picker,
-- auto-assign, and admin match suggestions all skip a disabled group. Its
-- existing members, its facilitator and its catch-mech follow-through are
-- untouched, and admins on the admin screens can still place people in
-- deliberately.
--
-- Defaults to true, unlike the `isOpen` columns on EventCluster beside it: those
-- guard public URLs that should wait to be opened, whereas every breakout group
-- that exists today is in play and must stay that way on deploy. No backfill
-- needed for the same reason.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.

ALTER TABLE "BreakoutGroup"
  ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;
