-- Two membership changes had no way to be recorded: a group changing leader, and
-- a member's standing moving between Member / Timothy / Leader. Both were silent
-- because SmallGroupLogAction had no value for them.
--
-- ADD VALUE IF NOT EXISTS is idempotent, so a retry after a partial run is safe.
-- The new values are not used by this migration, only by application code — on
-- PostgreSQL 12+ that is what makes ADD VALUE safe inside migrate's transaction.

ALTER TYPE "SmallGroupLogAction" ADD VALUE IF NOT EXISTS 'LeaderChanged';
ALTER TYPE "SmallGroupLogAction" ADD VALUE IF NOT EXISTS 'MemberStatusChanged';
