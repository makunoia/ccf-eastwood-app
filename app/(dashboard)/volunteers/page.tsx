import { Prisma, VolunteerStatus } from "@/app/generated/prisma/client"

import { db } from "@/lib/db"
import { type MemberVolunteerRow } from "./columns"
import { VolunteersTable } from "./volunteers-table"
import { VolunteerImportTrigger } from "./volunteer-import-trigger"
import { VolunteersFilters } from "./volunteers-filters"

async function getVolunteersByMember(
  where: Prisma.VolunteerWhereInput
): Promise<MemberVolunteerRow[]> {
  const volunteers = await db.volunteer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      event: { select: { name: true } },
      committee: { select: { name: true } },
      preferredRole: { select: { name: true } },
      assignedRole: { select: { name: true } },
    },
  })

  // Group by member
  const byMember = new Map<string, typeof volunteers>()
  for (const v of volunteers) {
    const key = v.member.id
    if (!byMember.has(key)) byMember.set(key, [])
    byMember.get(key)!.push(v)
  }

  // Build MemberVolunteerRow for each member
  return Array.from(byMember.values()).map((records) => {
    const member = records[0]!.member
    const memberName = `${member.firstName} ${member.lastName}`

    // Compute aggregated status (Pending if any pending, else Confirmed if any confirmed, else Rejected)
    let aggregatedStatus: "Pending" | "Confirmed" | "Rejected" = "Rejected"
    if (records.some((r) => r.status === VolunteerStatus.Pending)) {
      aggregatedStatus = "Pending"
    } else if (records.some((r) => r.status === VolunteerStatus.Confirmed)) {
      aggregatedStatus = "Confirmed"
    }

    return {
      memberId: member.id,
      memberName,
      totalEvents: records.length,
      aggregatedStatus,
      records: records.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        eventName: r.event.name,
        committee: r.committee.name,
        preferredRole: r.preferredRole.name,
        assignedRole: r.assignedRole?.name ?? null,
        status: r.status as "Pending" | "Confirmed" | "Rejected",
      })),
    }
  })
}

async function getEvents() {
  return db.event.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const status = (params.status as string) || ""
  const eventId = (params.eventId as string) || ""

  const where: Prisma.VolunteerWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { member: { firstName: { contains: search, mode: "insensitive" } } },
              { member: { lastName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      status ? { status: status as VolunteerStatus } : {},
      eventId ? { eventId } : {},
    ],
  }

  const [members, events] = await Promise.all([
    getVolunteersByMember(where),
    getEvents(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-headline">Volunteers</h2>
          <p className="text-sm text-muted-foreground">
            Manage volunteer registrations and role assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VolunteerImportTrigger events={events} />
        </div>
      </div>

      <VolunteersFilters
        key={`${search}-${status}-${eventId}`}
        events={events}
        search={search}
        status={status}
        eventId={eventId}
      />

      <VolunteersTable members={members} />
    </div>
  )
}
