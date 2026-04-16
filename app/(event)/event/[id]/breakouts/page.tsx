import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { BreakoutGroupsTab } from "@/app/(dashboard)/events/[id]/breakouts-tab"

const breakoutGroupsInclude = {
  orderBy: { createdAt: "asc" } as const,
  include: {
    facilitator: {
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    coFacilitator: {
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    members: {
      orderBy: { assignedAt: "asc" } as const,
      include: {
        registrant: {
          select: {
            id: true,
            memberId: true,
            guestId: true,
            firstName: true,
            lastName: true,
            nickname: true,
            mobileNumber: true,
            member: { select: { id: true, firstName: true, lastName: true } },
            guest: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    },
    lifeStage: { select: { id: true, name: true } },
  },
}

async function getEventBreakouts(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      registrants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          memberId: true,
          guestId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          mobileNumber: true,
          member: { select: { id: true, firstName: true, lastName: true } },
          guest: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      volunteers: {
        where: { status: "Confirmed" },
        orderBy: { createdAt: "asc" as const },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              smallGroup: {
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
      ministries: {
        include: {
          ministry: {
            select: {
              volunteers: {
                where: { status: "Confirmed" },
                include: {
                  member: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      smallGroup: {
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
      breakoutGroups: breakoutGroupsInclude,
    },
  })
}

export default async function BreakoutsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [event, lifeStages] = await Promise.all([
    getEventBreakouts(id),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!event) notFound()

  const confirmedVolunteers = [
    ...event.volunteers,
    ...event.ministries.flatMap((em) => em.ministry.volunteers),
  ]

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">Breakout Groups</h2>
      <BreakoutGroupsTab
        eventId={event.id}
        breakoutGroups={event.breakoutGroups}
        registrants={event.registrants}
        volunteers={confirmedVolunteers}
        lifeStages={lifeStages}
      />
    </div>
  )
}
