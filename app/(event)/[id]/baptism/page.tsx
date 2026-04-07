import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { BaptismClient } from "./baptism-client"

async function getEventBaptism(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      modules: { select: { type: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          memberId: true,
          guestId: true,
          firstName: true,
          lastName: true,
          mobileNumber: true,
          attendedAt: true,
          member: { select: { id: true, firstName: true, lastName: true, phone: true } },
          guest: { select: { id: true, firstName: true, lastName: true, phone: true } },
          baptismOptIn: { select: { id: true } },
        },
      },
    },
  })
}

export default async function BaptismPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventBaptism(id)
  if (!event) notFound()

  // Module guard — redirect gracefully if not enabled
  const hasBaptism = event.modules.some((m) => m.type === "Baptism")
  if (!hasBaptism) notFound()

  return (
    <BaptismClient
      eventId={event.id}
      registrants={event.registrants.map((r) => ({
        ...r,
        attendedAt: r.attendedAt?.toISOString() ?? null,
      }))}
    />
  )
}
