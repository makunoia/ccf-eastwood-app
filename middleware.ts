import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { ROUTE_PERMISSIONS } from "@/lib/permissions"
import type { FeatureArea } from "@/app/generated/prisma/client"

// Paths that never require auth or special handling
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon",
  "/manifest",
  "/sw.js",
  "/workbox-",
]

const EVENT_PUBLIC_PATTERNS = [
  /^\/events\/[^/]+\/register/,
  /^\/events\/[^/]+\/checkin/,
  /^\/volunteer-approval\//,
  /^\/ministries\/[^/]+\/volunteer/,
  /^\/events\/[^/]+\/volunteer/,
]

// Paths the user can visit while in the setup/onboarding flow
const SETUP_PATHS = ["/setup", "/login"]

export default auth(function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Allow public paths
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow public event/volunteer routes
  if (EVENT_PUBLIC_PATTERNS.some((re) => re.test(pathname))) {
    return NextResponse.next()
  }

  // ── Not authenticated → login ──────────────────────────────────────────────
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const user = session.user as any

  // ── TOTP second-step: credentials verified but TOTP not yet submitted ──────
  // (Handled by pre-auth cookie flow; full session only created after TOTP)
  // If someone reaches here without a full session, they've already been redirected above.

  // ── Setup flow: allow /setup/** and /login/** only ─────────────────────────
  if (user.requiresTotpSetup || user.mustChangePassword) {
    if (SETUP_PATHS.some((p) => pathname.startsWith(p))) {
      return NextResponse.next()
    }
    // Direct to the right setup step
    const dest = user.requiresTotpSetup ? "/setup/2fa" : "/setup/change-password"
    return NextResponse.redirect(new URL(dest, req.url))
  }

  // ── Super Admin: full access ───────────────────────────────────────────────
  if (user.role === "SuperAdmin") {
    return NextResponse.next()
  }

  // ── Staff: block /settings entirely ───────────────────────────────────────
  if (pathname.startsWith("/settings")) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // ── Staff: check feature permissions for protected routes ─────────────────
  for (const [prefix, feature] of Object.entries(ROUTE_PERMISSIONS) as [string, FeatureArea][]) {
    if (pathname.startsWith(prefix)) {
      const permissions: FeatureArea[] = user.permissions ?? []
      if (!permissions.includes(feature)) {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }

      // Event-specific access check
      if ((prefix === "/event" || prefix === "/events") && feature === "Events") {
        const eventIdMatch = pathname.match(/^\/event\/([^/]+)/)
        if (eventIdMatch) {
          const eventId = eventIdMatch[1]
          const allowed: string[] = user.eventAccess ?? []
          if (allowed.length > 0 && !allowed.includes(eventId)) {
            return NextResponse.redirect(new URL("/dashboard", req.url))
          }
        }
      }

      break
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
