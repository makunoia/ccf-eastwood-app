/**
 * Records one ConfirmationSubmission per time a facilitator (Catch Mech) or a
 * small group leader answers their confirmation form.
 *
 * This exists because the per-person trail cannot represent a submission that
 * changed nothing: a leader who defers every request writes no SmallGroupLog at
 * all, a Timothy declining with no group yet has no group to log against
 * (SmallGroupLog.smallGroupId is non-nullable), and a repeat submission is
 * skipped by the already-resolved guards. Those are exactly the cases an admin
 * needs to see, so the row is always written — never conditionally.
 *
 * `tallyDecisions` is pure so the counting rules can be tested without a DB.
 */

import type { Prisma } from "@/app/generated/prisma/client"

export type SubmissionCounts = {
  confirmedCount: number
  declinedCount: number
  deferredCount: number
}

/**
 * Tallies a decisions array by status. Anything that is not an explicit confirm
 * or decline counts as deferred — the leader form's three-state "pending" and
 * any future status both mean "the faci looked and did not decide", which is
 * still a real answer worth recording.
 */
export function tallyDecisions(decisions: readonly { status: string }[]): SubmissionCounts {
  let confirmedCount = 0
  let declinedCount = 0
  let deferredCount = 0

  for (const d of decisions) {
    if (d.status === "confirmed") confirmedCount++
    else if (d.status === "declined" || d.status === "rejected") declinedCount++
    else deferredCount++
  }

  return { confirmedCount, declinedCount, deferredCount }
}

export type RecordSubmissionInput = {
  source: "CatchMech" | "CatchMechVolunteer" | "SmallGroupLeader"
  // Catch Mech context
  sessionId?: string | null
  volunteerSessionId?: string | null
  eventId?: string | null
  breakoutGroupId?: string | null
  facilitatorVolunteerId?: string | null
  // Leader context
  smallGroupId?: string | null
  // Submitter
  submittedByMemberId?: string | null
  submittedByName: string
  createdGroupId?: string | null
  decisions: unknown
}

/**
 * Writes the submission row. Takes a transaction client so it commits atomically
 * with the work it describes — a submission row that survives a rolled-back
 * transaction would claim changes that never happened.
 */
export async function recordConfirmationSubmission(
  tx: Prisma.TransactionClient,
  input: RecordSubmissionInput & SubmissionCounts
): Promise<void> {
  await tx.confirmationSubmission.create({
    data: {
      source: input.source,
      sessionId: input.sessionId ?? null,
      volunteerSessionId: input.volunteerSessionId ?? null,
      eventId: input.eventId ?? null,
      breakoutGroupId: input.breakoutGroupId ?? null,
      facilitatorVolunteerId: input.facilitatorVolunteerId ?? null,
      smallGroupId: input.smallGroupId ?? null,
      submittedByMemberId: input.submittedByMemberId ?? null,
      submittedByName: input.submittedByName,
      confirmedCount: input.confirmedCount,
      declinedCount: input.declinedCount,
      deferredCount: input.deferredCount,
      createdGroupId: input.createdGroupId ?? null,
      decisions: (input.decisions ?? []) as Prisma.InputJsonValue,
    },
  })
}

/** Formats a submitter's display name, tolerating missing member records. */
export function submitterName(
  member: { firstName: string; lastName: string } | null | undefined
): string {
  if (!member) return "Unknown"
  return `${member.firstName} ${member.lastName}`.trim() || "Unknown"
}
