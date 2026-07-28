-- Existing events keep every feature they already had. Volunteers and Breakout
-- Groups were unconditionally available before they became opt-in modules, and any
-- event carrying a price was already tracking payment.
--
-- Separate from the enum migration on purpose: the new enum values cannot be used
-- in the same transaction that adds them.

INSERT INTO "EventModule" ("id", "eventId", "type", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", t."type", NOW(), NOW()
FROM "Event" e
CROSS JOIN (VALUES
  ('Volunteers'::"EventModuleType"),
  ('Breakout'::"EventModuleType")
) AS t("type")
ON CONFLICT ("eventId", "type") DO NOTHING;

INSERT INTO "EventModule" ("id", "eventId", "type", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'Priced'::"EventModuleType", NOW(), NOW()
FROM "Event" e
WHERE e."price" IS NOT NULL
ON CONFLICT ("eventId", "type") DO NOTHING;
