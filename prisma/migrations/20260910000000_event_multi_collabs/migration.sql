-- An event can take part in several collab days. The composite primary key keeps
-- each event-to-cluster link unique while this removes the old global limit.
DROP INDEX IF EXISTS "EventClusterEvent_eventId_key";

CREATE INDEX IF NOT EXISTS "EventClusterEvent_eventId_idx"
  ON "EventClusterEvent"("eventId");
