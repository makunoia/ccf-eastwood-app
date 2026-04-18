import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RegistrantsClient } from "./registrants-client"

async function getEventRegistrants(id: string, search: string, typeFilter: string) {
  const event = await db.event.findUnique({
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
  if (!event) return null

  let registrants = event.registrants

  // Type filter
  if (typeFilter === "member") {
    registrants = registrants.filter((r) => r.memberId !== null)
  } else if (typeFilter === "guest") {
    registrants = registrants.filter((r) => r.guestId !== null || (r.memberId === null && r.guestId === null))
  }

  // Search filter (name, phone, email)
  if (search) {
    const q = search.toLowerCase()
    registrants = registrants.filter((r) => {
      const name = r.member
        ? `${r.member.firstName} ${r.member.lastName}`
        : r.guest
        ? `${r.guest.firstName} ${r.guest.lastName}`
        : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? ""
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? ""
      return (
        name.toLowerCase().includes(q) ||
        phone.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q)
      )
    })
  }

  return { ...event, registrants }
}

export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const search = (sp.search as string) || ""
  const typeFilter = (sp.type as string) || ""

  const event = await getEventRegistrants(id, search, typeFilter)
  if (!event) notFound()

  return (
    <RegistrantsClient
      eventId={event.id}
      eventType={event.type}
      isPaidEvent={event.price != null}
      search={search}
      typeFilter={typeFilter}
      registrants={event.registrants.map((r) => ({
        ...r,
        attendedAt: r.attendedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  )
}
