import { db } from "@/lib/db"
import { type UserRow, type EventOption } from "./columns"
import { UsersTable } from "./users-table"
import { UsersToolbar } from "./toolbar"

async function getUsers(): Promise<UserRow[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tempPassword: true,
      totpEnabled: true,
      mustChangePassword: true,
      requiresTotpSetup: true,
      createdAt: true,
      permissions: { select: { feature: true } },
      eventAccess: { select: { eventId: true } },
    },
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    totpEnabled: u.totpEnabled,
    mustChangePassword: u.mustChangePassword,
    requiresTotpSetup: u.requiresTotpSetup,
    createdAt: u.createdAt,
    permissions: u.permissions.map((p) => p.feature),
    eventAccess: u.eventAccess.map((e) => e.eventId),
    tempPassword: u.tempPassword,
  }))
}

async function getEvents(): Promise<EventOption[]> {
  return db.event.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  })
}

export default async function UsersPage() {
  const [users, events] = await Promise.all([getUsers(), getEvents()])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-headline">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage admin accounts and their feature access
          </p>
        </div>
        <UsersToolbar events={events} />
      </div>

      <UsersTable users={users} events={events} />
    </div>
  )
}
