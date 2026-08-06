-- Per-event dashboard layout (which widgets show, in what order, at what width).
-- Additive only: no existing rows are read, updated or deleted. Events without
-- rows here keep rendering the code-defined default layout, so this migration is
-- a no-op for every event until an admin customizes one.

CREATE TABLE IF NOT EXISTS "EventDashboardWidget" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventDashboardWidget_eventId_key_key"
    ON "EventDashboardWidget"("eventId", "key");

CREATE INDEX IF NOT EXISTS "EventDashboardWidget_eventId_idx"
    ON "EventDashboardWidget"("eventId");

DO $$ BEGIN
  ALTER TABLE "EventDashboardWidget" ADD CONSTRAINT "EventDashboardWidget_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
