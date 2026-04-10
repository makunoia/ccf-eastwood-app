import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { authConfig } from "./auth.config"
import type { FeatureArea } from "@/app/generated/prisma/client"

// Create a lightweight Auth.js instance for middleware (no Prisma/DB imports)
const { auth } = NextAuth(authConfig)

// Paths that never require authentication
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

// Paths accessible during the first-login setup flow
const SETUP_PREFIXES = ["/2fa", "/change-password", "/login"]

// Maps route prefixes to the FeatureArea required to access them
const ROUTE_PERMISSIONS: [string, FeatureArea][] = [
  ["/members", "Members"],
  ["/guests", "Guests"],
  ["/small-groups", "SmallGroups"],
  ["/ministries", "Ministries"],
  ["/events", "Events"],
  ["/event", "Events"],
  ["/volunteers", "Volunteers"],
]

export default auth(function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Allow public paths
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow public event/volunteer paths
  if (EVENT_PUBLIC_PATTERNS.some((re) => re.test(pathname))) {
    return NextResponse.next()
  }

  // ── Not authenticated → login ──────────────────────────────────────────────
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const user = session.user as any

  // ── First-login setup flow ─────────────────────────────────────────────────
  if (user.requiresTotpSetup || user.mustChangePassword) {
    if (SETUP_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next()
    }
    const dest = user.requiresTotpSetup ? "/2fa" : "/change-password"
    return NextResponse.redirect(new URL(dest, req.url))
  }

  // ── Block setup pages for fully-set-up users ──────────────────────────────
  if (pathname.startsWith("/2fa") || pathname.startsWith("/change-password")) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // ── Super Admin: full access ───────────────────────────────────────────────
  if (user.role === "SuperAdmin") {
    return NextResponse.next()
  }

  // ── Staff: block /settings entirely ───────────────────────────────────────
  if (pathname.startsWith("/settings")) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // ── Staff: enforce feature-based route access ──────────────────────────────
  for (const [prefix, feature] of ROUTE_PERMISSIONS) {
    if (pathname.startsWith(prefix)) {
      const permissions: FeatureArea[] = user.permissions ?? []
      if (!permissions.includes(feature)) {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }

      // Event-specific access: check event ID if the user has a restricted list
      if (feature === "Events") {
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
