import { notFound } from "next/navigation"
import { db } from "@/lib/db"
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
      breakoutGroups: {
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
      },
    },
  })

  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null

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
      breakoutGroup: { select: { id: true, name: true } },
    },
  })

  const rows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    submittedByName: s.submittedByName,
    breakoutGroupId: s.breakoutGroup?.id ?? null,
    breakoutGroupName: s.breakoutGroup?.name ?? null,
    confirmedCount: s.confirmedCount,
    declinedCount: s.declinedCount,
    deferredCount: s.deferredCount,
    createdGroupId: s.createdGroupId,
    createdAt: s.createdAt,
  }))

  const responded = new Set(
    submissions.map((s) => s.facilitatorVolunteerId).filter((v): v is string => v !== null)
  )

  const expected: NonResponder[] = []
  for (const bg of event.breakoutGroups) {
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
    breakoutGroups: event.breakoutGroups.map((bg) => ({ id: bg.id, name: bg.name })),
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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <SubmissionsClient
        eventId={eventId}
        rows={data.rows}
        nonResponders={data.nonResponders}
        respondedCount={data.respondedCount}
        expectedCount={data.expectedCount}
        breakoutGroups={data.breakoutGroups}
      />
    </div>
  )
}
