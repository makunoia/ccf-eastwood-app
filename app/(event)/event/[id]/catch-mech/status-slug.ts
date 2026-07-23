import type { Prisma } from "@/app/generated/prisma/client"

/**
 * URL slugs for the Catch Mech status lists, shared by `[status]/page.tsx` and
 * `[status]/[rid]/page.tsx` (both validate the slug and 404 on a miss).
 *
 * "rejected" and "in-small-group" are BOTH Prisma status `Rejected` — they're
 * separated by `declineReason`. Catch mech only tries to match registrants who
 * aren't already in a small group, so an `AlreadyInSmallGroup` decline isn't a
 * rejection: those people were never candidates.
 */
/**
 * Reserved: "submissions" is a static sibling route (facilitator response
 * tracking). Next.js resolves it before this dynamic segment, so it must never
 * be added here.
 */
export const CATCH_MECH_SLUGS = [
  "confirmed",
  "rejected",
  "pending",
  "in-small-group",
] as const

export type CatchMechSlug = (typeof CATCH_MECH_SLUGS)[number]

export function isCatchMechSlug(value: string): value is CatchMechSlug {
  return (CATCH_MECH_SLUGS as readonly string[]).includes(value)
}

type SlugConfig = {
  prismaStatus: "Confirmed" | "Rejected" | "Pending"
  /** Display label. Distinct from prismaStatus — two slugs share `Rejected`. */
  label: string
  /** Narrows the two Rejected slugs apart. Undefined for non-Rejected slugs. */
  declineReasonWhere?: Prisma.SmallGroupMemberRequestWhereInput
}

export const SLUG_CONFIG: Record<CatchMechSlug, SlugConfig> = {
  confirmed: { prismaStatus: "Confirmed", label: "Confirmed" },
  pending: { prismaStatus: "Pending", label: "Pending" },
  rejected: {
    prismaStatus: "Rejected",
    label: "Rejected",
    // NOTE: `{ declineReason: { not: "AlreadyInSmallGroup" } }` is WRONG here — Prisma
    // emits a bare `"declineReason" <> $1`, and `NULL <> 'x'` is UNKNOWN, so every row
    // with a null reason is silently dropped. That's not an edge case: the small-group
    // leader path (app/small-group-confirmation/[token]/actions.ts) never writes
    // declineReason at all, so ALL leader-side rejections are null. The explicit OR
    // below emits `("declineReason" IS NULL OR "declineReason" <> $1)` and keeps them.
    declineReasonWhere: {
      OR: [{ declineReason: null }, { declineReason: { not: "AlreadyInSmallGroup" } }],
    },
  },
  "in-small-group": {
    prismaStatus: "Rejected",
    label: "In DGroup",
    declineReasonWhere: { declineReason: "AlreadyInSmallGroup" },
  },
}
