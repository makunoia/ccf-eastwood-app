-- Drop the enum column added in the previous migration
ALTER TABLE "Member" DROP COLUMN IF EXISTS "smallGroupStatus";

-- Drop the enum type
DROP TYPE IF EXISTS "SmallGroupStatus";

-- CreateTable
CREATE TABLE "SmallGroupStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmallGroupStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmallGroupStatus_name_key" ON "SmallGroupStatus"("name");

-- AlterTable: add FK column
ALTER TABLE "Member" ADD COLUMN "smallGroupStatusId" TEXT;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_smallGroupStatusId_fkey"
    FOREIGN KEY ("smallGroupStatusId") REFERENCES "SmallGroupStatus"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
