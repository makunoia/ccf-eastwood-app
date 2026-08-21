import { db } from "@/lib/db"

/**
 * Filing one volunteer sign-up against a Collab day.
 *
 * Two surfaces reach this: the day's public volunteer form
 * (`submitClusterVolunteerSignUp`) and the day's Volunteers screen
 * (`createClusterVolunteer`). They differ entirely in how they get here — one
 * verifies a mobile number and gates on `volunteerIsOpen`, the other on
 * `requireClusterWrite` — and not at all in what they write, so the write lives
 * once. A day whose admin-added volunteers were stamped differently from its
 * self-serve ones would be a day whose serving team depends on who typed it in.
 *
 * The reuse rule is the whole point and is the volunteer half of
 * `clusterDayRegistrationDisposition`: a `Volunteer` row is a standing fact about
 * a ministry's event, so a regular of either ministry already holds one that
 * predates the day. Creating a second is impossible in spirit (a person serves
 * one event once) and refusing outright — what the per-event form does — leaves
 * the day unable to hear from its own regulars at all. So the existing row is
 * reused: the stamp goes on and the preferences just given replace what was
 * there, while `status` is left alone, because a confirmation already granted is
 * not something either surface asked to revisit.
 */

export type ClusterVolunteerFiling = {
  clusterId: string
  /** The member event the sign-up is filed against — already resolved from the ministry answer and confirmed to be in the cluster. */
  eventId: string
  memberId: string
  committeeId: string
  preferredRoleId: string
  notes: string | null
}

/**
 * A refusal reason rather than a sentence. The public form apologises to a
 * volunteer and the admin screen names the person it turned away, so the wording
 * belongs to the caller; only the *reason* is decided here.
 */
export type ClusterVolunteerFilingFailure = "role" | "member" | "already"

export type ClusterVolunteerFilingResult =
  | { ok: true; id: string; reused: boolean }
  | { ok: false; reason: ClusterVolunteerFilingFailure }

export async function fileClusterVolunteerSignUp(
  input: ClusterVolunteerFiling
): Promise<ClusterVolunteerFilingResult> {
  const { clusterId, eventId, memberId, committeeId, preferredRoleId, notes } = input

  // The committee has to belong to the event the ministry named, and the role to
  // that committee — otherwise a hand-built payload could file someone onto the
  // partner ministry's team. Checked in one query so neither half can pass alone.
  const role = await db.committeeRole.findFirst({
    where: { id: preferredRoleId, committeeId, committee: { eventId } },
    select: { id: true },
  })
  if (!role) return { ok: false, reason: "role" }

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  })
  if (!member) return { ok: false, reason: "member" }

  const existing = await db.volunteer.findFirst({
    where: { memberId, eventId },
    select: { id: true, signUpClusterId: true },
  })
  if (existing?.signUpClusterId === clusterId) {
    return { ok: false, reason: "already" }
  }

  const volunteer = existing
    ? await db.volunteer.update({
        where: { id: existing.id },
        data: { signUpClusterId: clusterId, committeeId, preferredRoleId, notes },
        select: { id: true },
      })
    : await db.volunteer.create({
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId,
          notes,
          signUpClusterId: clusterId,
          leaderApprovalToken: crypto.randomUUID(),
          status: "Pending",
        },
        select: { id: true },
      })

  return { ok: true, id: volunteer.id, reused: existing !== null }
}
