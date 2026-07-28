-- CCF-132: Event Clusters — grouping of events with a shared public registration
-- form and an aggregated admin workspace. Idempotent per project conventions.

-- AlterTable: EventFormConfig gains clusterId (XOR with eventId, app-layer enforced)
ALTER TABLE "EventFormConfig" ADD COLUMN IF NOT EXISTS "clusterId" TEXT;
ALTER TABLE "EventFormConfig" ALTER COLUMN "eventId" DROP NOT NULL;

-- AlterTable: EventRegistrant provenance for cluster-originated registrations
ALTER TABLE "EventRegistrant" ADD COLUMN IF NOT EXISTS "registrationClusterId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EventCluster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3),
    "publicToken" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "registrationStart" TIMESTAMP(3),
    "registrationEnd" TIMESTAMP(3),
    "logoUrl" TEXT,
    "themeColorPrimary" TEXT,
    "registrationPageTitle" TEXT,
    "registrationPageDescription" TEXT,
    "registrationPageBannerUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EventClusterEvent" (
    "clusterId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventClusterEvent_pkey" PRIMARY KEY ("clusterId","eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EventCluster_publicToken_key" ON "EventCluster"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EventClusterEvent_eventId_key" ON "EventClusterEvent"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventFormConfig_clusterId_idx" ON "EventFormConfig"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EventFormConfig_clusterId_context_key" ON "EventFormConfig"("clusterId", "context");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventClusterEvent" ADD CONSTRAINT "EventClusterEvent_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventClusterEvent" ADD CONSTRAINT "EventClusterEvent_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventRegistrant" ADD CONSTRAINT "EventRegistrant_registrationClusterId_fkey"
    FOREIGN KEY ("registrationClusterId") REFERENCES "EventCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EventFormConfig" ADD CONSTRAINT "EventFormConfig_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
