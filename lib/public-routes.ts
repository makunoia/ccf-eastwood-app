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
  // Walk-in is its own route, not a variant of /register — the pattern above does
  // not cover it (CCF-133).
  /^\/events\/[^/]+\/walk-in/,
  /^\/events\/[^/]+\/checkin/,
  /^\/events\/[^/]+\/catch-mech/,
  // Cluster shared registration form, including its /walk-in child. The cluster
  // workspace at /cluster/[id] stays authenticated.
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
 * person in on submit. Its own route since CCF-133 — it used to be the shared
 * form plus `?checkin=1`, which left it with no identity of its own.
 */
export function clusterWalkInPath(publicToken: string): string {
  return `${clusterRegisterPath(publicToken)}/walk-in`
}

/**
 * The day's check-in kiosk: finds someone already registered and records their
 * attendance across every event of the day at once. Never creates a
 * registration — that is the walk-in door's job, and this screen links to it.
 */
export function clusterCheckinPath(publicToken: string): string {
  return `${clusterRegisterPath(publicToken)}/check-in`
}

/**
 * Where the cluster walk-in door's "Back" goes — the public kiosk, never the
 * cluster workspace.
 *
 * The door is a public route, so an admin href here bounces whoever is standing
 * at it to /login, and drags an admin who opened the door in its own tab back
 * into the app they already had open behind it. `undefined` when the kiosk is
 * closed: it answers to its own switch, and a way back to a closed link is worse
 * than no way back at all.
 */
export function clusterWalkInBackPath(
  publicToken: string,
  checkInIsOpen: boolean
): string | undefined {
  return checkInIsOpen ? clusterCheckinPath(publicToken) : undefined
}
