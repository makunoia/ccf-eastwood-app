/**
 * The shape of a Catch Mech facilitator's decisions, and the pure rules for
 * validating and resolving them.
 *
 * Split from `./confirmations.ts` because the faci form is a client component and
 * needs `applyDeclineReasons` at submit time. Its sibling reaches for `@/lib/db`,
 * and a single value import of that from a `"use client"` file drags the Prisma
 * driver adapter into the browser bundle — `pg` then asks for `tls` and the build
 * fails. Same reason `./targets.ts` stands apart: everything shared with a client
 * surface stays free of the database.
 *
 * Type-only imports from the generated Prisma client are erased and safe; value
 * imports from it are not, which is why the decline-reason check below reads the
 * label map rather than the `DeclineReason` enum object.
 */

import type { DeclineReason } from "@/app/generated/prisma/client"
import { DECLINE_REASON_LABELS } from "@/lib/decline-reason"
import type { CandidateGroup } from "@/lib/catch-mech/targets"

export type ConfirmDecision = {
  registrantId: string
  status: "confirmed" | "pending" | "declined"
  // Which of the faci's groups absorbs this person. Required on confirm when the
  // faci has more than one candidate group; ignored otherwise.
  targetGroupId?: string
  declineReason?: DeclineReason
  // Free-text detail, only used when declineReason is "Others"
  reason?: string
}

/** A decision paired with the group it resolves to (null = groupless decline). */
export type ResolvedDecision = ConfirmDecision & { groupId: string | null }

export function validateDecisions(decisions: ConfirmDecision[]): string | null {
  for (const d of decisions) {
    if (d.status !== "declined") continue
    // DECLINE_REASON_LABELS is typed Record<DeclineReason, string>, so it stays
    // exhaustive by compiler check — a new enum value fails the build until it
    // gets a label, rather than silently passing validation here.
    if (!d.declineReason || !(d.declineReason in DECLINE_REASON_LABELS)) {
      return "A decline reason is required for every declined member"
    }
    if (d.declineReason === "Others" && !d.reason?.trim()) {
      return "Please specify the reason when declining with Others"
    }
  }
  return null
}

/**
 * A faci leading several groups picks a destination per confirmed person. With one
 * candidate the picker never renders, so the single group is implied.
 */
export function validateTargets(
  decisions: ConfirmDecision[],
  candidates: CandidateGroup[]
): string | null {
  if (candidates.length <= 1) return null
  for (const d of decisions) {
    if (d.status !== "confirmed") continue
    if (!d.targetGroupId) {
      return "Please choose which DGroup each confirmed person will join"
    }
    if (!candidates.some((c) => c.id === d.targetGroupId)) {
      return "You can only confirm people into a DGroup you lead"
    }
  }
  return null
}

/** What the faci picked on the decline-reason step, keyed by registrant. */
export type DeclineReasonEntry = { declineReason: DeclineReason; note?: string }

/**
 * Folds the separately-collected decline reasons back into the staged decisions.
 *
 * The reason step walks declined people one at a time and can be stepped back
 * through, so a registrant's entry may be overwritten before submit. Reading the
 * map at submit time — rather than at the moment each reason was picked — is what
 * makes going back and changing an answer actually take effect.
 */
export function applyDeclineReasons(
  decisions: ConfirmDecision[],
  reasons: Record<string, DeclineReasonEntry>
): ConfirmDecision[] {
  return decisions.map((d) => {
    if (d.status !== "declined") return d
    const collected = reasons[d.registrantId]
    return { ...d, declineReason: collected?.declineReason, reason: collected?.note }
  })
}

export function resolveTargets(
  decisions: ConfirmDecision[],
  candidates: CandidateGroup[],
  declineGroupId: string | null
): ResolvedDecision[] {
  return decisions.map((d) => {
    if (d.status === "confirmed") {
      return { ...d, groupId: d.targetGroupId ?? candidates[0]?.id ?? null }
    }
    if (d.status === "declined") return { ...d, groupId: declineGroupId }
    return { ...d, groupId: null }
  })
}
