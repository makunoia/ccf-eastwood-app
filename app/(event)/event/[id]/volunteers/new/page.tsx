import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerForm } from "@/app/(dashboard)/volunteers/volunteer-form"

async function getData(eventId: string) {
  const [event, members] = await Promise.all([
    db.event.findUnique({
      where: { id: eventId },
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
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  return { event, members }
}

export default async function NewEventVolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { event, members } = await getData(id)
  if (!event) notFound()

  return <VolunteerForm members={members} events={[event]} />
}
