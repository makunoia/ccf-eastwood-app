-- Walk-in becomes a first-class form (CCF-133). Until now it was the registration
-- page wearing a query string (`/events/[id]/register?checkin=…`), which left it
-- with no Forms hub row, no open/close switch of its own, and no copyable link.
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.
-- `ADD VALUE IF NOT EXISTS` is a no-op when the value is already present. The new
-- value is not referenced by any statement in this migration — that is what makes
-- it safe to add inside Prisma's transaction, and why the column that goes with
-- it lives in the next migration instead.

ALTER TYPE "FormKey" ADD VALUE IF NOT EXISTS 'EventWalkIn';
