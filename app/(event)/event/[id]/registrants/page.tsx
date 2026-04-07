import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RegistrantsClient } from "./registrants-client"

async function getEventRegistrants(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      price: true,
      registrants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          memberId: true,
          guestId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          mobileNumber: true,
          isPaid: true,
          paymentReference: true,
          attendedAt: true,
          createdAt: true,
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          baptismOptIn: { select: { id: true } },
        },
      },
    },
  })
}

export default async function RegistrantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventRegistrants(id)
  if (!event) notFound()

  return (
    <RegistrantsClient
      eventId={event.id}
      eventType={event.type}
      isPaidEvent={event.price != null}
      registrants={event.registrants.map((r) => ({
        ...r,
        attendedAt: r.attendedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  )
}
