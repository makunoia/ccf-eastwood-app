/**
 * DGroup leadership rules for the public volunteer-info form.
 *
 * Pure — no db import — so both sides of the form can share one definition.
 * The client uses it to decide which option is pre-selected on lookup; the
 * server action uses it to decide what is actually persisted. Keeping the rule
 * in one place matters here: the client toggle and the server's `groupStatus`
 * write drifted apart once already, which is what let an active leader be
 * demoted back to Timothy on every submit.
 *
 * The key invariant, established by the catch-mech paths: a SmallGroup is only
 * `Pending` while it is a Timothy's *intended* group. It flips to `Active` the
 * moment anyone is added to it, and "a Timothy who takes in their first person
 * is a Leader from that moment". So an Active led group is hard proof of real
 * leadership and outranks a stale `Member.groupStatus`.
 */

export type LeadershipStatus = "leader" | "timothy"

/** What the server action accepts — "none" is retained for older clients. */
export type DeclaredLeadership = LeadershipStatus | "none"

export type SmallGroupStatus = "Active" | "Pending" | "Inactive"
export type MemberGroupStatus = "Member" | "Timothy" | "Leader"

export const LEADERSHIP_OPTIONS = [
  { value: "leader", label: "I lead a group" },
  { value: "timothy", label: "I want to lead a group" },
] as const satisfies readonly { value: LeadershipStatus; label: string }[]

/**
 * Which option a volunteer lands on after identity lookup.
 * `null` means we genuinely don't know — the form must make them choose.
 */
export function resolveInitialLeadership(identity: {
  groupStatus: MemberGroupStatus | null
  ledGroups: readonly { status: SmallGroupStatus }[]
}): LeadershipStatus | null {
  // Leading a live group wins over whatever groupStatus says.
  if (identity.ledGroups.some((g) => g.status === "Active")) return "leader"
  if (identity.groupStatus === "Leader") return "leader"
  // A Pending led group is an intended group — its owner is still a Timothy.
  if (identity.groupStatus === "Timothy" || identity.ledGroups.length > 0) return "timothy"
  return null
}

/**
 * The leadership actually written on submit. Guards against a stale toggle
 * (or a stale cached client) demoting someone whose group is already Active.
 */
export function resolveEffectiveLeadership(
  declared: DeclaredLeadership,
  targetGroupStatus: SmallGroupStatus | null
): DeclaredLeadership {
  if (declared === "timothy" && targetGroupStatus === "Active") return "leader"
  return declared
}

/** `Member.groupStatus` for a leadership choice. null = leave the field alone. */
export function memberGroupStatusFor(leadership: DeclaredLeadership): MemberGroupStatus | null {
  if (leadership === "leader") return "Leader"
  if (leadership === "timothy") return "Timothy"
  return null
}

/**
 * Status for a group being created. Leaders are live immediately; a Timothy's
 * intended group waits for its first member.
 */
export function newGroupStatusFor(leadership: LeadershipStatus): SmallGroupStatus {
  return leadership === "leader" ? "Active" : "Pending"
}

/** Whether an existing group should be flipped live by this submission. */
export function shouldActivateGroup(
  leadership: DeclaredLeadership,
  currentStatus: SmallGroupStatus
): boolean {
  return leadership === "leader" && currentStatus === "Pending"
}
