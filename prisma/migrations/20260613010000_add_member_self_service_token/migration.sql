ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "selfServiceToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Member_selfServiceToken_key" ON "Member"("selfServiceToken");
