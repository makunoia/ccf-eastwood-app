/**
 * The single source of truth for which paths are reachable without a session.
 *
 * Lives outside `proxy.ts` so it stays edge-safe (no Prisma, no Node built-ins)
 * *and* unit-testable — a public form that silently falls off this list bounces
 * real registrants to /login, which is invisible to anyone already signed in.
 */

/** Infrastructure and auth paths that never require a session. */
export const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon",
  "/manifest",
  "/sw.js",
  "/workbox-",
] as const

/**
 * Public-facing forms and token links. Anything a member, guest, volunteer or
 * small group leader opens from a shared link belongs here.
 */
export const PUBLIC_PATTERNS: RegExp[] = [
  /^\/events\/[^/]+\/register/,
  /^\/events\/[^/]+\/checkin/,
  /^\/events\/[^/]+\/catch-mech/,
  // Cluster shared registration form (also serves the walk-in variant via
  // ?checkin=1). The cluster workspace at /cluster/[id] stays authenticated.
  /^\/register\/c\/[^/]+/,
  /^\/join-small-group(\/|$)/,
  /^\/volunteer-approval\//,
  /^\/small-group-confirmation\//,
  /^\/ministries\/[^/]+\/volunteer/,
  /^\/events\/[^/]+\/volunteer/,
  /^\/me(\/|$)/,
]

/** True when `pathname` may be served without an authenticated session. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PATTERNS.some((re) => re.test(pathname))
  )
}

/** The cluster's shared registration link — what registrants are given. */
export function clusterRegisterPath(publicToken: string): string {
  return `/register/c/${publicToken}`
}

/**
 * The same form in door mode: ignores the open/close toggle and registration
 * window, reuses an existing registration instead of erroring, and checks the
 * person in on submit. `?checkin=1` is the flag the page reads.
 */
export function clusterWalkInPath(publicToken: string): string {
  return `${clusterRegisterPath(publicToken)}?checkin=1`
}
