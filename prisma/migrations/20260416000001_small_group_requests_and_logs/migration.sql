-- CreateEnum
CREATE TYPE "MemberRequestStatus" AS ENUM ('Pending', 'Confirmed', 'Rejected');

-- CreateEnum
CREATE TYPE "SmallGroupLogAction" AS ENUM ('GroupCreated', 'MemberAdded', 'MemberRemoved', 'MemberTransferred', 'TempAssignmentCreated', 'TempAssignmentConfirmed', 'TempAssignmentRejected');

-- AlterTable: add leaderConfirmationToken to SmallGroup
ALTER TABLE "SmallGroup" ADD COLUMN "leaderConfirmationToken" TEXT;

-- CreateIndex: unique constraint on leaderConfirmationToken
CREATE UNIQUE INDEX "SmallGroup_leaderConfirmationToken_key" ON "SmallGroup"("leaderConfirmationToken");

-- CreateTable: SmallGroupMemberRequest
CREATE TABLE "SmallGroupMemberRequest" (
    "id" TEXT NOT NULL,
    "smallGroupId" TEXT NOT NULL,
    "guestId" TEXT,
    "memberId" TEXT,
    "fromGroupId" TEXT,
    "status" "MemberRequestStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "assignedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmallGroupMemberRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SmallGroupLog
CREATE TABLE "SmallGroupLog" (
    "id" TEXT NOT NULL,
    "smallGroupId" TEXT NOT NULL,
    "action" "SmallGroupLogAction" NOT NULL,
    "memberId" TEXT,
    "guestId" TEXT,
    "fromGroupId" TEXT,
    "toGroupId" TEXT,
    "performedByUserId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmallGroupLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: SmallGroupMemberRequest -> SmallGroup (target group)
ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_smallGroupId_fkey" FOREIGN KEY ("smallGroupId") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupMemberRequest -> Guest
ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupMemberRequest -> Member
ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupMemberRequest -> SmallGroup (from group for transfers)
ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "SmallGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupMemberRequest -> User
ALTER TABLE "SmallGroupMemberRequest" ADD CONSTRAINT "SmallGroupMemberRequest_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupLog -> SmallGroup
ALTER TABLE "SmallGroupLog" ADD CONSTRAINT "SmallGroupLog_smallGroupId_fkey" FOREIGN KEY ("smallGroupId") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupLog -> Member
ALTER TABLE "SmallGroupLog" ADD CONSTRAINT "SmallGroupLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupLog -> Guest
ALTER TABLE "SmallGroupLog" ADD CONSTRAINT "SmallGroupLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SmallGroupLog -> User
ALTER TABLE "SmallGroupLog" ADD CONSTRAINT "SmallGroupLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
