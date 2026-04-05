import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ManifestPrint } from "./manifest-print"

async function getBusManifest(busId: string) {
  const bus = await db.bus.findUnique({
    where: { id: busId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          startDate: true,
          ministry: { select: { name: true } },
        },
      },
      passengers: {
        orderBy: { createdAt: "asc" },
        include: {
          registrant: {
            include: {
              member: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
          volunteer: {
            include: {
              member: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
        },
      },
    },
  })
  return bus ?? null
}

const DIRECTION_LABELS: Record<string, string> = {
  ToVenue: "To Venue",
  FromVenue: "From Venue",
  Both: "Both ways",
}

export default async function ManifestPage({
  params,
}: {
  params: Promise<{ id: string; busId: string }>
}) {
  const { busId } = await params
  const bus = await getBusManifest(busId)
  if (!bus) notFound()

  type Passenger = {
    id: string
    name: string
    mobile: string | null
    type: "Member" | "Guest" | "Volunteer"
  }

  const passengers: Passenger[] = bus.passengers.map((p) => {
    if (p.volunteer) {
      return {
        id: p.id,
        name: `${p.volunteer.member.firstName} ${p.volunteer.member.lastName}`,
        mobile: p.volunteer.member.phone,
        type: "Volunteer" as const,
      }
    }
    const r = p.registrant!
    const name = r.member
      ? `${r.member.firstName} ${r.member.lastName}`
      : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
    const mobile = r.member ? r.member.phone : r.mobileNumber
    return {
      id: p.id,
      name,
      mobile,
      type: r.memberId ? ("Member" as const) : ("Guest" as const),
    }
  })

  return (
    <ManifestPrint
      busName={bus.name}
      direction={DIRECTION_LABELS[bus.direction] ?? bus.direction}
      capacity={bus.capacity}
      eventName={bus.event.name}
      eventDate={bus.event.startDate.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}
      ministry={bus.event.ministry.name}
      passengers={passengers}
    />
  )
}
