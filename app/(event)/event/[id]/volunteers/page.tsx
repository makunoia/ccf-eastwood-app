import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteersTab, type EventVolunteer } from "@/app/(dashboard)/events/[id]/volunteers-tab"
import { VolunteerImportButton } from "./volunteer-import-button"

async function getEventVolunteers(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      volunteers: {
        orderBy: { createdAt: "asc" as const },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          committee: { select: { id: true, name: true } },
          preferredRole: { select: { id: true, name: true } },
          assignedRole: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export default async function VolunteersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventVolunteers(id)
  if (!event) notFound()

  const volunteers: EventVolunteer[] = event.volunteers.map((v) => ({
    id: v.id,
    status: v.status,
    notes: v.notes,
    member: v.member,
    committee: v.committee,
    preferredRole: v.preferredRole,
    assignedRole: v.assignedRole,
  }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Volunteers</h2>
        <div className="flex items-center gap-3">
          {volunteers.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {volunteers.length} total
            </span>
          )}
          <VolunteerImportButton eventId={event.id} />
        </div>
      </div>
      <VolunteersTab volunteers={volunteers} eventId={event.id} />
    </div>
  )
}
