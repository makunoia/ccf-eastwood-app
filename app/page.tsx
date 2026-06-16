import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { resolveLandingPath } from "@/lib/landing"

export default async function RootPage() {
  const session = await auth()
  if (session?.user) {
    redirect(
      resolveLandingPath({
        role: session.user.role,
        permissions: session.user.permissions,
        eventAccess: session.user.eventAccess,
      })
    )
  }
  redirect("/login")
}
