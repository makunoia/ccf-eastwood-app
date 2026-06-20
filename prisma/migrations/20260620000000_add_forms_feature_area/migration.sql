-- Add the Forms value to the FeatureArea enum.
-- Kept in its own migration with no other statements: Postgres cannot use a
-- newly added enum value within the same transaction it was added in.
ALTER TYPE "FeatureArea" ADD VALUE IF NOT EXISTS 'Forms';
