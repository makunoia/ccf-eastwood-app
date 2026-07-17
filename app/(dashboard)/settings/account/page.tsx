import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProfileForm } from "./profile-form"
import { ChangePasswordForm } from "./change-password-form"
import type { UserPermissionEntry } from "@/types/next-auth"

export const metadata: Metadata = {
  title: "Account · Settings",
}

const FEATURE_LABELS: Record<string, string> = {
  Members: "Members",
  Guests: "Guests",
  SmallGroups: "Small Groups",
  Ministries: "Ministries",
  Events: "Events",
  Volunteers: "Volunteers",
}

const ACTION_LABELS: Record<string, string> = {
  Read: "Read",
  Write: "Write",
  Import: "Import",
  Export: "Export",
}

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const { name, username, role, permissions } = session.user

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h2 className="type-headline">Account</h2>
        <p className="text-sm text-muted-foreground">Manage your profile and security settings</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Update your display name</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={name ?? ""} username={username ?? ""} />
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Choose a strong password you don&apos;t use elsewhere</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {/* Role & Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role & Permissions</CardTitle>
          <CardDescription>Your access level in this application</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant={role === "SuperAdmin" ? "default" : "secondary"}>
              {role === "SuperAdmin" ? "Super Admin" : "Staff"}
            </Badge>
          </div>

          {role === "SuperAdmin" ? (
            <p className="text-sm text-muted-foreground">
              Full access to all features and settings.
            </p>
          ) : (
            <PermissionsTable permissions={permissions ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PermissionsTable({ permissions }: { permissions: UserPermissionEntry[] }) {
  if (permissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No feature access has been assigned.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {permissions.map(({ feature, actions }) => (
        <div key={feature} className="flex items-center justify-between gap-4 py-1.5 border-b last:border-0">
          <span className="text-sm font-medium">{FEATURE_LABELS[feature] ?? feature}</span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {actions.map((action) => (
              <Badge key={action} variant="outline" className="text-xs">
                {ACTION_LABELS[action] ?? action}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
