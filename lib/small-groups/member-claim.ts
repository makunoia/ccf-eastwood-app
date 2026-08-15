import { isExternalSatellite } from "@/lib/constants/ccf-satellites"
import { db } from "@/lib/db"

/**
 * "I'm already in a DGroup" for a **Member** — the member-side twin of
 * `Guest.claimedSmallGroupId` / `Guest.claimedSatellite`.
 *
 * The public surfaces used to offer this branch to guests only. The reason was
 * storage, not policy: a guest has two scratch columns to hold a self-report,
 * whereas `Member.smallGroupId` is real membership that only an admin may set,
 * so a member's answer had nowhere to land. That is no longer true — the member
 * portal (CCF-103) already asks members this exact question and records it two
 * ways, and this is the same pair of writes moved somewhere both the event
 * registration form and the check-in kiosk can reach:
 *
 *   - **Named a leader here** → a *Pending* `SmallGroupMemberRequest`. Naming a
 *     leader is an intention, not a placement; `Member.smallGroupId` stays null
 *     until that leader or an admin confirms, so the admin-owned rule survives.
 *   - **Named another satellite** → `Member.upwardSatellite`, mirrored onto
 *     `SmallGroup.parentSatellite` for every group they lead, exactly as
 *     `setUpwardSatellite` does in the portal. There is no local group to point
 *     at, so a request would have no recipient.
 *
 * Never throws. This is follow-up bookkeeping hanging off a registration or a
 * kiosk check-in that has already succeeded; failing the whole submission over
 * it would be the worse bug. Callers get a reason back and may ignore it.
 */

export type MemberGroupClaim =
  | { scope: "group"; smallGroupId: string }
  | { scope: "satellite"; satellite: string }

export type MemberClaimResult =
  | { recorded: true; scope: "group"; requestId: string }
  | { recorded: true; scope: "satellite" }
  | {
      recorded: false
      reason:
        | "already-placed"
        | "already-requested"
        | "group-not-found"
        | "unknown-satellite"
        | "member-not-found"
        | "error"
    }

/**
 * Where the claim came from, spliced into the `SmallGroupLog` description so an
 * admin reading a group's history can tell a portal declaration from one typed
 * at a registration desk.
 */
export type MemberClaimSource = "event registration" | "event check-in"

export async function recordMemberGroupClaim(
  memberId: string,
  claim: MemberGroupClaim,
  source: MemberClaimSource
): Promise<MemberClaimResult> {
  try {
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { id: true, firstName: true, lastName: true, smallGroupId: true },
    })
    if (!member) return { recorded: false, reason: "member-not-found" }

    // Already in a DGroup here — the claim is simply true, and re-recording it
    // as a request would queue a transfer nobody asked for. The public forms
    // drop the whole DGroup section for these people, so this only catches a
    // stale client or a crafted POST.
    if (member.smallGroupId) return { recorded: false, reason: "already-placed" }

    const memberName = `${member.firstName} ${member.lastName}`

    if (claim.scope === "satellite") {
      if (!isExternalSatellite(claim.satellite)) {
        return { recorded: false, reason: "unknown-satellite" }
      }
      await db.$transaction(async (tx) => {
        await tx.member.update({
          where: { id: memberId },
          data: { upwardSatellite: claim.satellite },
        })
        // Matched by leader rather than by ids read beforehand, so a group
        // created in between is covered too — same rule as `setUpwardSatellite`.
        await tx.smallGroup.updateMany({
          where: { leaderId: memberId },
          // The parent is either a DGroup here or a satellite — never both.
          data: { parentSatellite: claim.satellite, parentGroupId: null },
        })
      })
      return { recorded: true, scope: "satellite" }
    }

    // Any open request already has this person in an admin's queue — whether
    // they're seeking placement or someone has picked a group for them. A second
    // row is noise on the same screen. Mirrors `createSeekerRequestFromRegistration`.
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: { memberId, status: "Pending" },
      select: { id: true },
    })
    if (existing) return { recorded: false, reason: "already-requested" }

    const group = await db.smallGroup.findUnique({
      where: { id: claim.smallGroupId },
      select: { id: true, status: true },
    })
    if (!group || group.status === "Inactive") {
      return { recorded: false, reason: "group-not-found" }
    }

    // `origin` stays `Assignment` (the default): this names a specific group,
    // which is what that origin covers. `RegistrationIntent` is reserved for the
    // groupless "I want to join *a* DGroup" rows the Seeking tab reads, and
    // putting a group-bearing row there would corrupt that tab's one invariant.
    const requestId = await db.$transaction(async (tx) => {
      const request = await tx.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, memberId, status: "Pending" },
        select: { id: true },
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId: group.id,
          action: "TempAssignmentCreated",
          memberId,
          toGroupId: group.id,
          performedByMemberId: memberId,
          description: `${memberName} said they are already in this group at ${source} (pending leader confirmation)`,
        },
      })
      return request.id
    })

    return { recorded: true, scope: "group", requestId }
  } catch {
    // Never propagate — the registration or check-in that triggered this has
    // already completed.
    return { recorded: false, reason: "error" }
  }
}
