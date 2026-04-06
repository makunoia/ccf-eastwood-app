import { db } from "@/lib/db"
import { VolunteerForm } from "../volunteer-form"

async function getDeps() {
  const [members, ministries, events] = await Promise.all([
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.ministry.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        committees: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            roles: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    db.event.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        committees: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            roles: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true },
            },
          },
        },
        ministries: {
          include: {
            ministry: {
              select: {
                id: true,
                name: true,
                committees: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true,
                    name: true,
                    roles: {
                      orderBy: { createdAt: "asc" },
                      select: { id: true, name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ])
  return { members, ministries, events }
}

export default async function NewVolunteerPage() {
  const { members, ministries, events } = await getDeps()

  const mappedEvents = events.map((e) => ({
    id: e.id,
    name: e.name,
    committees: e.committees,
    affiliatedMinistries: e.ministries.map((em) => em.ministry),
  }))

  return (
    <VolunteerForm members={members} ministries={ministries} events={mappedEvents} />
  )
}
