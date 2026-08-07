/**
 * The one place breakout capacity is reasoned about.
 *
 * Every surface that shows "how full is this group" — the registration picker,
 * the session detail page, the breakouts list, the add-registrant sheet —
 * derives from `breakoutOccupancy` rather than recomputing `memberCount >=
 * memberLimit` in place. Before this existed the same expression lived in six
 * files and they disagreed at the edges: some rendered a negative `remaining`
 * for an over-capacity group, and a null `memberLimit` variously meant "0 left"
 * or `NaN`.
 *
 * Pure and client-safe on purpose (no `db` import) — the registration form is a
 * client component and needs the same arithmetic the server used.
 */

export type CapacityInput = {
  memberCount: number
  memberLimit: number | null
}

export type BreakoutOccupancy = {
  memberCount: number
  memberLimit: number | null
  /**
   * Open slots. `null` when the group is uncapped — an unlimited group has no
   * meaningful "remaining", and rendering 0 there is the exact bug this guards.
   */
  remaining: number | null
  isFull: boolean
  /** Strictly past the cap — a group can be over without anyone having erred, e.g. after a limit is lowered. */
  isOver: boolean
  /** 0..1, clamped. `null` when uncapped — there is nothing to fill against. */
  fillRatio: number | null
  /** "8 / 12" when capped, "8" when not. */
  label: string
}

export function breakoutOccupancy({ memberCount, memberLimit }: CapacityInput): BreakoutOccupancy {
  if (memberLimit == null) {
    return {
      memberCount,
      memberLimit: null,
      remaining: null,
      isFull: false,
      isOver: false,
      fillRatio: null,
      label: String(memberCount),
    }
  }

  // A limit of 0 is a real (if unusual) configuration: the group is closed.
  // Guarding it here is what keeps `fillRatio` off Infinity/NaN.
  const fillRatio = memberLimit === 0 ? 1 : Math.min(1, Math.max(0, memberCount / memberLimit))

  return {
    memberCount,
    memberLimit,
    remaining: Math.max(0, memberLimit - memberCount),
    isFull: memberCount >= memberLimit,
    isOver: memberCount > memberLimit,
    fillRatio,
    label: `${memberCount} / ${memberLimit}`,
  }
}

/**
 * Most room first, for "where should the next person go?".
 *
 * An uncapped group genuinely has more room than any capped one, so it sorts
 * ahead of everything — that is the honest answer, not a special case bolted on
 * to avoid a null.
 */
export function compareByRoom(a: BreakoutOccupancy, b: BreakoutOccupancy): number {
  const room = (o: BreakoutOccupancy) => (o.remaining == null ? Number.POSITIVE_INFINITY : o.remaining)
  return room(b) - room(a)
}
