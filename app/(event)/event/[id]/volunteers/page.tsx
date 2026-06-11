import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { VolunteersTab, type EventVolunteer } from "@/app/(dashboard)/events/[id]/volunteers-tab"
import { VolunteersToolbar } from "./volunteers-toolbar"
import { VolunteersFilters } from "./volunteers-filters"

async function getEventVolunteers(
  id: string,
  filters: { search: string; status: string; committeeId: string }
) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      volunteers: {
        where: {
          AND: [
            filters.status ? { status: filters.status as "Pending" | "Confirmed" | "Rejected" } : {},
            filters.committeeId ? { committeeId: filters.committeeId } : {},
            filters.search
              ? {
                  member: {
                    OR: [
                      { firstName: { contains: filters.search, mode: "insensitive" } },
                      { lastName: { contains: filters.search, mode: "insensitive" } },
                    ],
                  },
                }
              : {},
          ],
        },
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          committee: { select: { id: true, name: true } },
          preferredRole: { select: { id: true, name: true } },
          assignedRole: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export default async function VolunteersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const search = (sp.search as string) || ""
  const status = (sp.status as string) || ""
  const committeeId = (sp.committeeId as string) || ""

  const [event, committees] = await Promise.all([
    getEventVolunteers(id, { search, status, committeeId }),
    db.volunteerCommittee.findMany({
      where: { eventId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!event) notFound()

  const volunteers: EventVolunteer[] = event.volunteers.map((v) => ({
    id: v.id,
    status: v.status,
    notes: v.notes,
    member: v.member,
    committee: v.committee,
    preferredRole: v.preferredRole,
    assignedRole: v.assignedRole,
  }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Volunteers"
        actions={<VolunteersToolbar eventId={event.id} />}
      />

      <VolunteersFilters
        committees={committees}
        search={search}
        status={status}
        committeeId={committeeId}
      />

      <VolunteersTab volunteers={volunteers} eventId={event.id} />
    </div>
  )
}
