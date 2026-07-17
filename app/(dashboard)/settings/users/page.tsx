import type { Metadata } from "next"
import { db } from "@/lib/db"
import { type UserRow, type EventOption } from "./columns"
import { UsersTable } from "./users-table"
import { UsersToolbar } from "./toolbar"
import { PageHeader } from "@/components/page-header"
import type { FeatureArea, PermissionAction } from "@/app/generated/prisma/client"

export const metadata: Metadata = {
  title: "Users · Settings",
}

type PermissionEntry = { feature: FeatureArea; actions: PermissionAction[] }

async function getUsers(): Promise<UserRow[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      tempPassword: true,
      totpEnabled: true,
      mustChangePassword: true,
      requiresTotpSetup: true,
      createdAt: true,
      permissions: { select: { feature: true, action: true } },
      eventAccess: { select: { eventId: true } },
    },
  })

  return users.map((u) => {
    // Group permission rows by feature
    const permMap = new Map<FeatureArea, PermissionAction[]>()
    for (const { feature, action } of u.permissions) {
      const existing = permMap.get(feature)
      if (existing) {
        existing.push(action)
      } else {
        permMap.set(feature, [action])
      }
    }
    const permissions: PermissionEntry[] = Array.from(permMap.entries()).map(
      ([feature, actions]) => ({ feature, actions })
    )

    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      totpEnabled: u.totpEnabled,
      mustChangePassword: u.mustChangePassword,
      requiresTotpSetup: u.requiresTotpSetup,
      createdAt: u.createdAt,
      permissions,
      eventAccess: u.eventAccess.map((e) => e.eventId),
      tempPassword: u.tempPassword,
    }
  })
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
      <PageHeader
        title="Users"
        description="Manage admin accounts and their feature access"
        actions={<UsersToolbar events={events} />}
      />

      <UsersTable users={users} events={events} />
    </div>
  )
}
