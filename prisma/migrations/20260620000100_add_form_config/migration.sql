-- FormKey enum
DO $$ BEGIN
  CREATE TYPE "FormKey" AS ENUM (
    'JoinSmallGroup',
    'MemberSelfService',
    'SmallGroupConfirmation',
    'EventRegistration',
    'VolunteerSignUp',
    'VolunteerInfo',
    'VolunteerApproval',
    'CatchMech'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FormConfig table
CREATE TABLE IF NOT EXISTS "FormConfig" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "key" "FormKey" NOT NULL,
    "eventId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "primaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormConfig_scopeKey_key" ON "FormConfig"("scopeKey");
CREATE INDEX IF NOT EXISTS "FormConfig_eventId_idx" ON "FormConfig"("eventId");

DO $$ BEGIN
  ALTER TABLE "FormConfig" ADD CONSTRAINT "FormConfig_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
