import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { resolveSubmissionDecisions } from "@/lib/catch-mech/submission-detail"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"
import { SubmissionsClient, type SubmissionRow, type NonResponder } from "./submissions-client"

/**
 * Facilitator response tracking for an event's Catch Mech form.
 *
 * Note this is a static segment sitting beside the dynamic `[status]` segment.
 * Next.js resolves static before dynamic, so "submissions" never reaches the
 * status list — see the reserved-slug note in ../status-slug.ts.
 */
async function getSubmissionsData(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      modules: { select: { type: true } },
    },
  })

  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null

  // Under a Collab the tables this event follows up on are the cluster's, keyed
  // to it through their facilitator — see `lib/catch-mech/scope.ts`.
  const scope = await resolveCatchMechScope(eventId)
  const breakoutGroups = await db.breakoutGroup.findMany({
    where: scope.where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      // Both roles matter: a session is created for whichever faci verifies,
      // so a co-faci who never responds must show up as a non-responder too.
      facilitator: {
        select: { id: true, member: { select: { firstName: true, lastName: true } } },
      },
      coFacilitator: {
        select: { id: true, member: { select: { firstName: true, lastName: true } } },
      },
    },
  })

  const submissions = await db.confirmationSubmission.findMany({
    where: { eventId, source: "CatchMech" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      submittedByName: true,
      facilitatorVolunteerId: true,
      confirmedCount: true,
      declinedCount: true,
      deferredCount: true,
      createdGroupId: true,
      createdAt: true,
      decisions: true,
      breakoutGroup: { select: { id: true, name: true } },
    },
  })

  // Who each facilitator actually confirmed vs declined, not just how many.
  const decisionsBySubmission = await resolveSubmissionDecisions(submissions)

  const rows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    submittedByName: s.submittedByName,
    breakoutGroupId: s.breakoutGroup?.id ?? null,
    breakoutGroupName: s.breakoutGroup?.name ?? null,
    confirmedCount: s.confirmedCount,
    declinedCount: s.declinedCount,
    deferredCount: s.deferredCount,
    createdGroupId: s.createdGroupId,
    decisions: decisionsBySubmission.get(s.id) ?? [],
    createdAt: s.createdAt,
  }))

  const responded = new Set(
    submissions.map((s) => s.facilitatorVolunteerId).filter((v): v is string => v !== null)
  )

  const expected: NonResponder[] = []
  for (const bg of breakoutGroups) {
    for (const faci of [bg.facilitator, bg.coFacilitator]) {
      if (!faci) continue
      expected.push({
        volunteerId: faci.id,
        name: `${faci.member.firstName} ${faci.member.lastName}`.trim() || "Unknown",
        breakoutGroupId: bg.id,
        breakoutGroupName: bg.name,
      })
    }
  }

  const nonResponders = expected.filter((e) => !responded.has(e.volunteerId))

  return {
    rows,
    nonResponders,
    respondedCount: expected.length - nonResponders.length,
    expectedCount: expected.length,
    breakoutGroups: breakoutGroups.map((bg) => ({ id: bg.id, name: bg.name })),
  }
}

export default async function CatchMechSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = await params
  const data = await getSubmissionsData(eventId)
  if (!data) notFound()

  const session = await auth()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <SubmissionsClient
        eventId={eventId}
        rows={data.rows}
        nonResponders={data.nonResponders}
        respondedCount={data.respondedCount}
        expectedCount={data.expectedCount}
        breakoutGroups={data.breakoutGroups}
        canViewMember={canRead(session, "Members")}
        canViewSmallGroup={canRead(session, "SmallGroups")}
      />
    </div>
  )
}
