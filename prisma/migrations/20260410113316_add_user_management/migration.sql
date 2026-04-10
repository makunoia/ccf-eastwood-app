-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SuperAdmin', 'Staff');

-- CreateEnum
CREATE TYPE "FeatureArea" AS ENUM ('Members', 'Guests', 'SmallGroups', 'Ministries', 'Events', 'Volunteers');

-- AlterTable
ALTER TABLE "Guest" ALTER COLUMN "language" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Member" ALTER COLUMN "language" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresTotpSetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'Staff',
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "FeatureArea" NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEventAccess" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "UserEventAccess_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_feature_key" ON "UserPermission"("userId", "feature");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
