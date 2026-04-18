import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"

import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { BreakoutSection } from "./breakout-match-section"

async function getRegistrant(registrantId: string, eventId: string) {
  return db.eventRegistrant.findFirst({
    where: { id: registrantId, eventId },
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
      member: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
      guest: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
      breakoutGroupMemberships: {
        select: {
          breakoutGroup: { select: { id: true, name: true } },
        },
      },
    },
  })
}

/** Returns the breakout group this member facilitates or co-facilitates in this event, if any. */
async function getFacilitatedGroup(memberId: string, eventId: string) {
  return db.breakoutGroup.findFirst({
    where: {
      eventId,
      OR: [
        {
          facilitator: {
            memberId,
            OR: [
              { eventId },
              { ministry: { events: { some: { eventId } } } },
            ],
          },
        },
        {
          coFacilitator: {
            memberId,
            OR: [
              { eventId },
              { ministry: { events: { some: { eventId } } } },
            ],
          },
        },
      ],
    },
    select: { id: true, name: true },
  })
}

async function getAllEventGroups(eventId: string, excludeIds: string[]) {
  const groups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      memberLimit: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  })
  return groups
    .filter((g) => !excludeIds.includes(g.id))
    .map((g) => ({ id: g.id, name: g.name, memberLimit: g.memberLimit, currentCount: g._count.members }))
}

function resolveDisplayName(r: NonNullable<Awaited<ReturnType<typeof getRegistrant>>>) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—"
}

function resolveContact(r: NonNullable<Awaited<ReturnType<typeof getRegistrant>>>) {
  return {
    phone: r.member?.phone ?? r.guest?.phone ?? r.mobileNumber,
    email: r.member?.email ?? r.guest?.email ?? r.email,
  }
}

export default async function RegistrantDetailPage({
  params,
}: {
  params: Promise<{ id: string; registrantId: string }>
}) {
  const { id: eventId, registrantId } = await params
  const registrant = await getRegistrant(registrantId, eventId)
  if (!registrant) notFound()

  const assignedGroupIds = registrant.breakoutGroupMemberships.map((m) => m.breakoutGroup.id)
  const isAssigned = assignedGroupIds.length > 0

  const [facilitatedGroup, allEventGroups] = await Promise.all([
    registrant.memberId ? getFacilitatedGroup(registrant.memberId, eventId) : null,
    getAllEventGroups(eventId, assignedGroupIds),
  ])

  const name = resolveDisplayName(registrant)
  const contact = resolveContact(registrant)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href={`/event/${eventId}/registrants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Registrants
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{name}</h2>
        {registrant.memberId ? (
          <Badge variant="secondary">Member</Badge>
        ) : (
          <Badge variant="outline">Guest</Badge>
        )}
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Contact details */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Contact</h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <span className="text-muted-foreground">Mobile</span>
            <span>{contact.phone ?? <span className="text-muted-foreground">—</span>}</span>
            <span className="text-muted-foreground">Email</span>
            <span>{contact.email ?? <span className="text-muted-foreground">—</span>}</span>
          </div>
        </section>

        {/* Breakout group section */}
        <section className="space-y-3">
          {isAssigned ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Breakout Group</h3>
              <div className="rounded-lg border p-3">
                {registrant.breakoutGroupMemberships.map((m) => (
                  <p key={m.breakoutGroup.id} className="text-sm font-medium">
                    {m.breakoutGroup.name}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <BreakoutSection
              registrantId={registrantId}
              eventId={eventId}
              facilitatedGroup={facilitatedGroup ?? null}
              allEventGroups={allEventGroups}
            />
          )}
        </section>
      </div>
    </div>
  )
}
