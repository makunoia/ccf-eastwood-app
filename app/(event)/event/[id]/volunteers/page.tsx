import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { VolunteersTab, type EventVolunteer } from "@/app/(dashboard)/events/[id]/volunteers-tab"
import type { VolunteerExportRow } from "@/lib/export-entities"
import { VolunteersToolbar } from "./volunteers-toolbar"
import { VolunteersBatchBar } from "./volunteers-batch-bar"
import { VolunteersFilters } from "./volunteers-filters"

export const metadata: Metadata = {
  title: "Volunteers",
}

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
              email: true,
              phone: true,
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

  const [session, event, committees] = await Promise.all([
    auth(),
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

  const exportRows: VolunteerExportRow[] = event.volunteers.map((v) => ({
    firstName: v.member.firstName,
    lastName: v.member.lastName,
    email: v.member.email,
    phone: v.member.phone,
    committeeName: v.committee.name,
    preferredRole: v.preferredRole.name,
    assignedRole: v.assignedRole?.name ?? null,
    status: v.status,
    notes: v.notes,
  }))

  const selectionEnabled = canWrite(session, "Events")

  return (
    <BatchSelectionProvider
      allIds={volunteers.map((v) => v.id)}
      enabled={selectionEnabled}
    >
      <div className="flex flex-1 flex-col gap-4 p-6">
        <PageHeader
          title="Volunteers"
          actions={
            <VolunteersBatchBar eventId={event.id}>
              <VolunteersToolbar eventId={event.id} exportRows={exportRows} />
            </VolunteersBatchBar>
          }
        />

        <VolunteersFilters
          committees={committees}
          search={search}
          status={status}
          committeeId={committeeId}
        />

        <VolunteersTab volunteers={volunteers} eventId={event.id} />
      </div>
    </BatchSelectionProvider>
  )
}
