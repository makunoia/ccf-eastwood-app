/**
 * Activity signals for a duplicate-profile candidate, and the rule for deciding
 * which candidate in a group is the live profile.
 *
 * Merging is one-way and irreversible: the keeper absorbs the losers' rows and
 * the losers are deleted. Which record to keep is therefore the whole decision,
 * and a name plus a Member/Guest badge is not enough to make it. These counts
 * exist so the admin can see, in the row itself, which record is actually wired
 * into the church's data.
 *
 * The type lives here rather than in the server action so the comparison rules
 * below can be unit-tested without pulling in `db`.
 */

export type RecordActivity = {
  events: number
  checkIns: number
  ledGroups: number
  /** Always 0 for a Guest — only Members hold Volunteer records. */
  volunteerRoles: number
  familyLinks: number
  /** `Member.smallGroup.name`, or a Guest's self-reported `claimedSmallGroup.name`. */
  groupName: string | null
  /** True when `groupName` came from a guest's check-in answer — unconfirmed. */
  groupIsClaimed: boolean
  /** `upwardSatellite` / `claimedSatellite` — set when the DGroup is at another satellite. */
  satellite: string | null
  /** ISO. Most recent of the record's own `updatedAt` and its latest registration. */
  lastActivityAt: string | null
  /** ISO. */
  createdAt: string
}

export const EMPTY_ACTIVITY: RecordActivity = {
  events: 0,
  checkIns: 0,
  ledGroups: 0,
  volunteerRoles: 0,
  familyLinks: 0,
  groupName: null,
  groupIsClaimed: false,
  satellite: null,
  lastActivityAt: null,
  createdAt: new Date(0).toISOString(),
}

/**
 * The comparable metrics, in a fixed order. Group membership is folded in as a
 * 0/1 so "is in a DGroup" counts as a signal without ranking one group above
 * another. `satellite`, `createdAt` and the dates are deliberately excluded —
 * they describe a record, they don't measure its use.
 */
export function activityVector(a: RecordActivity): number[] {
  return [
    a.events,
    a.checkIns,
    a.ledGroups,
    a.volunteerRoles,
    a.familyLinks,
    a.groupName ? 1 : 0,
  ]
}

/** Nothing recorded against this profile at all — the safe one to discard. */
export function isEmptyActivity(a: RecordActivity): boolean {
  return activityVector(a).every((n) => n === 0)
}

/**
 * Index of the record that dominates every sibling, or `null` when none does.
 *
 * Dominance, not a weighted score: a record qualifies only when it is >= every
 * other record on *every* metric and strictly > on at least one. A composite
 * score would need weights nobody can justify, and would confidently rank the
 * genuinely ambiguous case — a record with more events but fewer led groups is
 * not obviously the keeper, and the UI should say nothing rather than guess.
 *
 * `null` is therefore a real answer: it marks the groups that need a human.
 */
export function dominantIndex(list: RecordActivity[]): number | null {
  if (list.length < 2) return null

  const vectors = list.map(activityVector)

  for (let i = 0; i < vectors.length; i++) {
    // An all-zero record can technically dominate a set of all-zero records, but
    // "most activity" over nothing is noise. Require something to point at.
    if (vectors[i].every((n) => n === 0)) continue

    let strictlyGreaterSomewhere = false
    let dominates = true

    for (let j = 0; j < vectors.length && dominates; j++) {
      if (i === j) continue
      for (let k = 0; k < vectors[i].length; k++) {
        if (vectors[i][k] < vectors[j][k]) {
          dominates = false
          break
        }
        if (vectors[i][k] > vectors[j][k]) strictlyGreaterSomewhere = true
      }
    }

    if (dominates && strictlyGreaterSomewhere) return i
  }

  return null
}
