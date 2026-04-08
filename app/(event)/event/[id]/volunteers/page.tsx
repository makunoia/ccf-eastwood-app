import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteersTab, type VolunteerGroup } from "@/app/(dashboard)/events/[id]/volunteers-tab"
import { VolunteerImportButton } from "./volunteer-import-button"

async function getEventVolunteers(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      ministries: {
        include: {
          ministry: {
            select: {
              id: true,
              name: true,
              lifeStage: { select: { id: true, name: true } },
              volunteers: {
                orderBy: { createdAt: "asc" as const },
                include: {
                  member: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      ledGroups: {
                        select: {
                          id: true,
                          name: true,
                          lifeStageId: true,
                          genderFocus: true,
                          language: true,
                          ageRangeMin: true,
                          ageRangeMax: true,
                          meetingFormat: true,
                          locationCity: true,
                        },
                      },
                    },
                  },
                  committee: { select: { id: true, name: true } },
                  preferredRole: { select: { id: true, name: true } },
                  assignedRole: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      volunteers: {
        orderBy: { createdAt: "asc" as const },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: {
                select: {
                  id: true,
                  name: true,
                  lifeStageId: true,
                  genderFocus: true,
                  language: true,
                  ageRangeMin: true,
                  ageRangeMax: true,
                  meetingFormat: true,
                  locationCity: true,
                },
              },
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

  const volunteerGroups: VolunteerGroup[] = [
    ...event.ministries.map((em) => ({
      label: em.ministry.name,
      source: "ministry" as const,
      volunteers: em.ministry.volunteers,
    })),
    ...(event.volunteers.length > 0 || event.ministries.length === 0
      ? [{ label: "Event", source: "event" as const, volunteers: event.volunteers }]
      : []),
  ]

  const totalCount = volunteerGroups.reduce((sum, g) => sum + g.volunteers.length, 0)

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Volunteers</h2>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">{totalCount} total</span>
          )}
          <VolunteerImportButton eventId={event.id} />
        </div>
      </div>
      <VolunteersTab groups={volunteerGroups} eventId={event.id} />
    </div>
  )
}
