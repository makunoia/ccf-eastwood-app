import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerSignUpForm } from "@/app/volunteers/volunteer-sign-up-form"

async function getEvent(id: string) {
  return db.event.findUnique({
    where: { id },
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
  })
}

export default async function EventVolunteerSignUpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  return (
    <VolunteerSignUpForm
      contextName={event.name}
      eventId={event.id}
      committees={event.committees}
    />
  )
}
