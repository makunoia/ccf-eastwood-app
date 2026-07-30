-- EventRegistrant.memberId carried Prisma's default action for an optional
-- relation, ON DELETE SET NULL. Deleting a Member therefore nulled the FK on
-- every one of their registrations instead of removing them. Because a promoted
-- guest's registrations are moved from guestId onto memberId, those rows were
-- left with BOTH person FKs null and the personal name columns empty — a
-- registrant no query can resolve to a person.
--
-- Cascade matches the guestId side and every other Member-owned relation in the
-- schema (FamilyMember, Volunteer, SmallGroupMemberRequest, SchedulePreference,
-- MemberLog), so deleting a person now removes their registrations outright
-- rather than leaving nameless rows behind.
--
-- Pre-existing orphans are NOT touched here — they hold real attendance and
-- payment history and deleting them is an admin decision, not a schema one.
-- Use `pnpm tsx scripts/find-orphan-registrants.ts` to review them.

ALTER TABLE "EventRegistrant" DROP CONSTRAINT IF EXISTS "EventRegistrant_memberId_fkey";

DO $$ BEGIN
  ALTER TABLE "EventRegistrant" ADD CONSTRAINT "EventRegistrant_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
