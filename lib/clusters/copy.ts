/**
 * User-facing strings shared between a cluster's public form and the server
 * action behind it.
 *
 * Its own module, free of imports, because the obvious home —
 * `lib/validations/event-cluster.ts` — imports `ClusterKind` from the generated
 * Prisma client. A client component importing from there drags Prisma into the
 * browser bundle and the build fails on `node:module`. Shared copy is exactly the
 * kind of thing both sides need, so it lives where both sides can reach it.
 */

/**
 * The collab form asks which *ministry* the person is part of, so the rejection
 * has to name a ministry. Telling someone to "select an event" would be about a
 * question they were never shown — which is precisely the bug this replaced.
 */
export const MINISTRY_REQUIRED_ERROR = "Select which ministry you're part of."
