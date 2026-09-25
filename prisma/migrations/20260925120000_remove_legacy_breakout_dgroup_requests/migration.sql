-- A breakout transfer used to create a Pending DGroup request for the
-- destination table's linked group. The seat and request were inserted in one
-- transaction, so their database now() defaults have the same timestamp.
-- Keep requests with comments or an audit entry: those may have been handled
-- by a person after the automatic insert.
DELETE FROM "SmallGroupMemberRequest" AS request
WHERE request."status" = 'Pending'
  AND request."origin" = 'Assignment'
  AND request."breakoutGroupId" IS NOT NULL
  AND request."assignedByUserId" IS NULL
  AND request."fromGroupId" IS NULL
  AND request."declinedByVolunteerId" IS NULL
  AND request."declineReason" IS NULL
  AND request."sourceEventId" IS NULL
  AND request."notes" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "BreakoutGroupMember" AS seat
    JOIN "EventRegistrant" AS registrant ON registrant."id" = seat."registrantId"
    JOIN "BreakoutGroup" AS breakout ON breakout."id" = seat."breakoutGroupId"
    WHERE seat."breakoutGroupId" = request."breakoutGroupId"
      AND seat."assignedAt" = request."createdAt"
      AND breakout."linkedSmallGroupId" = request."smallGroupId"
      AND (
        (request."guestId" IS NOT NULL AND registrant."guestId" = request."guestId")
        OR (request."memberId" IS NOT NULL AND registrant."memberId" = request."memberId")
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "CatchMechComment" AS comment
    WHERE comment."requestId" = request."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "SmallGroupLog" AS log
    WHERE log."smallGroupId" = request."smallGroupId"
      AND (
        (request."guestId" IS NOT NULL AND log."guestId" = request."guestId")
        OR (request."memberId" IS NOT NULL AND log."memberId" = request."memberId")
      )
      AND log."createdAt" >= request."createdAt"
  );

-- A later transfer could mark that generated request Rejected and leave a
-- specific audit message. Remove only rows whose resolution time matches that
-- cancellation, and retain the append-only log as historical evidence.
DELETE FROM "SmallGroupMemberRequest" AS request
WHERE request."status" = 'Rejected'
  AND request."origin" = 'Assignment'
  AND request."breakoutGroupId" IS NOT NULL
  AND request."declinedByVolunteerId" IS NULL
  AND request."declineReason" IS NULL
  AND request."notes" IS NULL
  AND request."resolvedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "SmallGroupLog" AS log
    WHERE log."smallGroupId" = request."smallGroupId"
      AND log."action" = 'TempAssignmentRejected'
      AND log."description" = 'Pending Catch Mech membership was cancelled after moving to another breakout group'
      AND (
        (request."guestId" IS NOT NULL AND log."guestId" = request."guestId")
        OR (request."memberId" IS NOT NULL AND log."memberId" = request."memberId")
      )
      AND log."createdAt" BETWEEN request."resolvedAt" - INTERVAL '1 minute'
                              AND request."resolvedAt" + INTERVAL '1 minute'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "CatchMechComment" AS comment
    WHERE comment."requestId" = request."id"
  );

-- Pending rows without the matching seat timestamp cannot be identified as
-- automatic: an admin can create a pending Catch Mech request with the same
-- columns. Leave those rows for case-by-case review.
