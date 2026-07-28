-- Check-in gets its own entry on the event Forms page, separate from the
-- Registration form. The two were sharing one editor, which made the Registration
-- page hard to read: Register and Walk-in configure the same component, whereas
-- Check-in is a different surface with a different shape (no payment, no breakout
-- picker, no birth date, and its matching fields aren't nested under DGroup).
--
-- Written idempotently per CLAUDE.md so a partial run can be safely retried.
-- `ADD VALUE IF NOT EXISTS` is a no-op when the value is already present. The new
-- value is not referenced by any statement in this migration, which is what makes
-- it safe to add inside Prisma's transaction.

ALTER TYPE "FormKey" ADD VALUE IF NOT EXISTS 'EventCheckIn';
