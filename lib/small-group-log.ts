/**
 * Display helpers for SmallGroupLog entries.
 *
 * A log row's actor is either an admin User (dashboard writes) or a Member (the
 * public token flows — Catch Mech facilitators and small group leaders never log
 * in, so they have no User). Renderers show whichever is set.
 */

import type { SmallGroupLogAction } from "@/app/generated/prisma/client"

/**
 * Human label per action, keyed by the Prisma enum rather than a hand-written
 * union. Three activity logs used to keep their own copy of both, so adding an
 * enum value meant three silent gaps; `Record<SmallGroupLogAction, string>` now
 * makes a missing label a compile error.
 */
export const SMALL_GROUP_LOG_LABEL: Record<SmallGroupLogAction, string> = {
  GroupCreated: "Group created",
  MemberAdded: "Added to DGroup",
  MemberRemoved: "Removed from DGroup",
  MemberTransferred: "Transferred to another group",
  TempAssignmentCreated: "Temporary assignment created",
  TempAssignmentConfirmed: "Temporary assignment confirmed",
  TempAssignmentRejected: "Temporary assignment rejected",
  LeaderChanged: "Leader changed",
  MemberStatusChanged: "Group status changed",
}

/** How an action reads: a gain, a loss, or neither. Drives icon and colour. */
export type LogTone = "positive" | "negative" | "neutral"

export const SMALL_GROUP_LOG_TONE: Record<SmallGroupLogAction, LogTone> = {
  GroupCreated: "neutral",
  MemberAdded: "positive",
  MemberRemoved: "negative",
  MemberTransferred: "neutral",
  TempAssignmentCreated: "neutral",
  TempAssignmentConfirmed: "positive",
  TempAssignmentRejected: "negative",
  // Neither a gain nor a loss for the group — the roster is unchanged.
  LeaderChanged: "neutral",
  MemberStatusChanged: "neutral",
}

export type LogActorShape = {
  performedByUser?: { name: string | null } | null
  performedByMember?: { firstName: string; lastName: string } | null
}

/** Name to attribute a log entry to, or null when the actor is unknown. */
export function logActorName(entry: LogActorShape): string | null {
  if (entry.performedByUser?.name) return entry.performedByUser.name
  if (entry.performedByMember) {
    const name = `${entry.performedByMember.firstName} ${entry.performedByMember.lastName}`.trim()
    if (name) return name
  }
  return null
}
