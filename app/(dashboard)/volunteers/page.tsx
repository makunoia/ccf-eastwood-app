import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { type VolunteerRow } from "./columns"
import { VolunteersTable } from "./volunteers-table"
import { VolunteerImportTrigger } from "./volunteer-import-trigger"

async function getVolunteers(): Promise<VolunteerRow[]> {
  const volunteers = await db.volunteer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { firstName: true, lastName: true } },
      ministry: { select: { name: true } },
      event: { select: { name: true } },
      committee: { select: { name: true } },
      preferredRole: { select: { name: true } },
      assignedRole: { select: { name: true } },
    },
  })

  return volunteers.map((v) => ({
    id: v.id,
    memberName: `${v.member.firstName} ${v.member.lastName}`,
    scope: v.ministry
      ? `Ministry: ${v.ministry.name}`
      : `Event: ${v.event?.name ?? ""}`,
    committee: v.committee.name,
    preferredRole: v.preferredRole.name,
    assignedRole: v.assignedRole?.name ?? null,
    status: v.status as "Pending" | "Confirmed" | "Rejected",
  }))
}

async function getScopeOptions() {
  const [ministries, events] = await Promise.all([
    db.ministry.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.event.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  return { ministries, events }
}

export default async function VolunteersPage() {
  const [volunteers, { ministries, events }] = await Promise.all([
    getVolunteers(),
    getScopeOptions(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Volunteers</h2>
          <p className="text-sm text-muted-foreground">
            Manage volunteer registrations and role assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VolunteerImportTrigger ministries={ministries} events={events} />
          <Button asChild>
            <Link href="/volunteers/new">
              <IconPlus />
              <span className="hidden sm:inline">Add Volunteer</span>
            </Link>
          </Button>
        </div>
      </div>

      <VolunteersTable volunteers={volunteers} />
    </div>
  )
}
