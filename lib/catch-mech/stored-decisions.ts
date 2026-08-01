/**
 * Reads back what a facilitator or volunteer actually decided about each person,
 * out of `ConfirmationSubmission.decisions`.
 *
 * That raw JSON is the only faithful per-submission record. `SmallGroupMemberRequest`
 * holds the current state of a person, not who decided it in which sitting: a
 * confirm carries no submitter attribution, a person can be decided on twice by
 * two facilitators, and a request removed later leaves no trace of the submission
 * that raised it. The decisions blob is written in the same transaction as the
 * work it describes, so it is exact and immutable.
 *
 * Deliberately defensive: three flows write this column, it has no schema, and
 * one malformed historical row must not take down an admin page.
 *
 * No DB import — this is pure, so both server pages and unit tests can use it.
 */

import type { DeclineReason } from "@/app/generated/prisma/client"
import { DECLINE_REASON_LABELS, formatDeclineReason } from "@/lib/decline-reason"

/** Normalised outcome for one person in one submission. */
export type StoredDecisionStatus = "confirmed" | "declined" | "deferred"

export type StoredDecision = {
  registrantId: string
  status: StoredDecisionStatus
  /** Destination DGroup on a confirm; null when none was recorded. */
  smallGroupId: string | null
  /** Human-readable decline reason, including the free text for "Others". */
  declineReason: string | null
}

/**
 * A stored decision with the people and groups it points at resolved for
 * display. Defined here — beside the raw reader and away from `@/lib/db` — so
 * the client component that renders it never reaches a module that imports the
 * Prisma adapter.
 */
export type SubmissionDecision = {
  registrantId: string
  name: string
  /** Set once the person is a Member — a confirmed guest is promoted on submit. */
  memberId: string | null
  status: StoredDecisionStatus
  declineReason: string | null
  smallGroupId: string | null
  smallGroupName: string | null
}

/**
 * Mirrors `tallyDecisions`: "rejected" is the leader form's word for the faci
 * form's "declined", and anything else means the submitter looked and did not
 * decide. Keeping the two in step is what lets the stored counts and this list
 * agree on any given row.
 */
function normalizeStatus(value: unknown): StoredDecisionStatus {
  if (value === "confirmed") return "confirmed"
  if (value === "declined" || value === "rejected") return "declined"
  return "deferred"
}

function isDeclineReason(value: unknown): value is DeclineReason {
  return typeof value === "string" && value in DECLINE_REASON_LABELS
}

export function readStoredDecisions(value: unknown): StoredDecision[] {
  if (!Array.isArray(value)) return []
  const decisions: StoredDecision[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const decision = entry as Record<string, unknown>
    if (typeof decision.registrantId !== "string") continue
    const status = normalizeStatus(decision.status)
    decisions.push({
      registrantId: decision.registrantId,
      status,
      smallGroupId: typeof decision.targetGroupId === "string" ? decision.targetGroupId : null,
      // Only a decline carries a reason; a stray reason on a confirm is noise.
      declineReason:
        status === "declined"
          ? formatDeclineReason(
              isDeclineReason(decision.declineReason) ? decision.declineReason : null,
              typeof decision.reason === "string" && decision.reason.trim()
                ? decision.reason.trim()
                : null
            )
          : null,
    })
  }
  return decisions
}
