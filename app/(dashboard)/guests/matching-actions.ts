"use server"

import { matchSmallGroups } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function findSmallGroupMatchesForGuest(
  guestId: string
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchSmallGroups({ guestId }, { limit: 5 })
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}
