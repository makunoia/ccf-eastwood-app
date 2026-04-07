import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDetail } from "./event-detail"
import { RecurringEventDetail } from "./recurring-event-detail"
import { MultiDayEventDetail } from "./multiday-event-detail"
import { ensureMultiDayOccurrences } from "../actions"

async function getEventType(id: string) {
  return db.event.findUnique({ where: { id }, select: { id: true, type: true } })
}

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
      },
    },
    coFacilitator: {
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

async function getEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
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
      modules: { select: { type: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          baptismOptIn: { select: { id: true } },
        },
      },
      baptismOptIns: { select: { registrantId: true } },
      buses: {
        orderBy: { createdAt: "asc" },
        include: {
          passengers: {
            include: {
              registrant: {
                include: {
                  member: { select: { id: true, firstName: true, lastName: true, phone: true } },
                  guest: { select: { id: true, firstName: true, lastName: true } },
                },
              },
              volunteer: {
                include: {
                  member: { select: { id: true, firstName: true, lastName: true } },
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
          busPassengers: { select: { id: true, busId: true } },
        },
      },
      breakoutGroups: breakoutGroupsInclude,
    },
  })
  if (!event) return null
  return event
}

async function getMultiDayEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
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
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      },
      occurrences: {
        orderBy: { date: "asc" },
        include: {
          _count: { select: { attendees: true } },
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
      breakoutGroups: breakoutGroupsInclude,
    },
  })
  if (!event) return null
  return event
}

async function getRecurringEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
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
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      },
      occurrences: {
        orderBy: { date: "desc" },
        include: {
          _count: { select: { attendees: true } },
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
      breakoutGroups: breakoutGroupsInclude,
    },
  })
  if (!event) return null
  return event
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [probe, lifeStages] = await Promise.all([
    getEventType(id),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!probe) notFound()

  if (probe.type === "Recurring") {
    const event = await getRecurringEvent(id)
    if (!event) notFound()
    return <RecurringEventDetail event={event} lifeStages={lifeStages} />
  }

  if (probe.type === "MultiDay") {
    const event = await getMultiDayEvent(id)
    if (!event) notFound()
    // Ensure one occurrence per day in the date range exists
    await ensureMultiDayOccurrences(event.id, event.startDate, event.endDate)
    // Re-fetch after ensuring occurrences so we get the latest data
    const fresh = await getMultiDayEvent(id)
    if (!fresh) notFound()
    return <MultiDayEventDetail event={fresh} lifeStages={lifeStages} />
  }

  const event = await getEvent(id)
  if (!event) notFound()
  return <EventDetail event={event} lifeStages={lifeStages} />
}
