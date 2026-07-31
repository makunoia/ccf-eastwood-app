"use server"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canRead, canAccessEvent } from "@/lib/permissions"
import {
  matchBreakoutGroups,
  scoreCandidatesForBreakout,
  buildCandidateFromRegistrant,
  deriveEffectiveGenderFocus,
} from "@/lib/matching"
import { MAX_BREAKOUT_CANDIDATES } from "@/lib/breakouts/candidate-filters"
import type { MatchResult } from "@/lib/matching/types"
import { addRegistrantsToBreakout } from "./breakout-actions"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
import { registrantName, registrantNameSelect } from "@/lib/metadata"
import { getEffectiveFormConfigs } from "@/lib/forms/context-config-server"
import { mergeFormConfigs } from "@/lib/forms/registration-responses"
import type { EventFormConfigData } from "@/lib/forms/context-config"
import type { BreakoutCandidate, BreakoutCriteria } from "@/lib/breakouts/candidate-filters"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Read access to one event's data.
 *
 * Middleware already gates `/event/<id>` by feature + event access, but it does
 * so on the *URL's* event id. A server action carries its own argument, so a
 * user scoped to event A could otherwise pass event B's id from A's page.
 */
async function requireEventRead(eventId: string): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canRead(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

export type BreakoutGroupDetails = {
  id: string
  name: string
  facilitator: { firstName: string; lastName: string } | null
  coFacilitator: { firstName: string; lastName: string } | null
  lifeStages: { name: string }[]
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  locationCity: string | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  memberLimit: number | null
  schedules: { dayOfWeek: number; timeStart: string; timeEnd: string | null }[]
  members: { id: string; name: string }[]
  currentCount: number
}

/**
 * Fetches one breakout group's details for the match-result drawer. Scoped by
 * `{ id, eventId }` — a groupId from another event resolves to null (404),
 * which is the authz boundary for this event-scoped entity.
 */
export async function getBreakoutGroupDetails(
  groupId: string,
  eventId: string
): Promise<ActionResult<BreakoutGroupDetails>> {
  const denied = await requireEventRead(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    const g = await db.breakoutGroup.findFirst({
      where: { id: groupId, eventId },
      select: {
        id: true,
        name: true,
        genderFocus: true,
        language: true,
        locationCity: true,
        meetingFormat: true,
        memberLimit: true,
        lifeStages: { select: { name: true }, orderBy: { order: "asc" } },
        schedules: {
          select: { dayOfWeek: true, timeStart: true, timeEnd: true },
          orderBy: [{ dayOfWeek: "asc" }, { timeStart: "asc" }],
        },
        facilitator: { select: { member: { select: { firstName: true, lastName: true } } } },
        coFacilitator: { select: { member: { select: { firstName: true, lastName: true } } } },
        members: {
          orderBy: { assignedAt: "asc" },
          select: {
            registrant: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                member: { select: { firstName: true, lastName: true } },
                guest: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    })

    if (!g) return { success: false, error: "Breakout group not found" }

    const members = g.members.map((m) => {
      const r = m.registrant
      const name = r.member
        ? `${r.member.firstName} ${r.member.lastName}`
        : r.guest
        ? `${r.guest.firstName} ${r.guest.lastName}`
        : [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"
      return { id: r.id, name }
    })

    return {
      success: true,
      data: {
        id: g.id,
        name: g.name,
        facilitator: g.facilitator?.member ?? null,
        coFacilitator: g.coFacilitator?.member ?? null,
        lifeStages: g.lifeStages,
        genderFocus: g.genderFocus,
        language: g.language,
        locationCity: g.locationCity,
        meetingFormat: g.meetingFormat,
        memberLimit: g.memberLimit,
        schedules: g.schedules,
        members,
        currentCount: members.length,
      },
    }
  } catch {
    return { success: false, error: "Failed to load breakout group details" }
  }
}

// ─── Candidate picker ─────────────────────────────────────────────────────────

/**
 * The person columns the picker needs. A superset of what the matching engine
 * consumes (it adds `workIndustry`, and the bucket's id + label for the age
 * filter), selected once and used for BOTH the display projection and the
 * CandidateProfile the scorer takes — see `buildCandidateFromRegistrant`.
 */
const CANDIDATE_PERSON_SELECT = {
  lifeStageId: true,
  gender: true,
  language: true,
  birthMonth: true,
  birthYear: true,
  ageRangeBucket: { select: { id: true, label: true, minAge: true, maxAge: true } },
  workCity: true,
  workIndustry: true,
  meetingPreference: true,
} as const

export type BreakoutCandidateList = {
  /** The group's own criteria, with gender focus already resolved. */
  criteria: BreakoutCriteria
  /** Merged across Register/WalkIn/CheckIn — the surface someone used isn't recorded. */
  formConfig: EventFormConfigData
  lifeStages: { id: string; name: string }[]
  ageRangeBuckets: { id: string; label: string; minAge: number | null; maxAge: number | null }[]
  /** Registration order, capped at MAX_BREAKOUT_CANDIDATES; the client re-sorts. */
  candidates: BreakoutCandidate[]
  /** Size of the whole unassigned pool, which may exceed `candidates.length`. */
  totalPool: number
  truncated: boolean
  memberLimit: number | null
  currentCount: number
}

/**
 * Everything the "Add registrants" picker needs, in one round trip: the pool of
 * unassigned candidates with their matching attributes and a fit score against
 * this group, plus the group criteria and option lists the filters render from.
 *
 * Group facts are returned once at the top level rather than on every candidate
 * — the raw MatchResult carries a full groupSummary, which would be N identical
 * copies.
 *
 * Scoped by `{ id: groupId, eventId }`: a group id from another event resolves
 * to null, same authz boundary as `getBreakoutGroupDetails`.
 */
export async function listBreakoutCandidates(
  groupId: string,
  eventId: string
): Promise<ActionResult<BreakoutCandidateList>> {
  const denied = await requireEventRead(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    const group = await db.breakoutGroup.findFirst({
      where: { id: groupId, eventId },
      select: {
        memberLimit: true,
        language: true,
        ageRangeMin: true,
        ageRangeMax: true,
        meetingFormat: true,
        locationCity: true,
        genderFocus: true,
        lifeStages: { select: { id: true } },
        schedules: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: "asc" } },
        _count: { select: { members: true } },
        facilitator: { select: { member: { select: { gender: true } } } },
        coFacilitator: { select: { member: { select: { gender: true } } } },
        linkedSmallGroup: { select: { genderFocus: true } },
      },
    })
    if (!group) return { success: false, error: "Breakout group not found" }

    const [rows, totalPool, formConfigs, lifeStages, ageRangeBuckets] = await Promise.all([
      db.eventRegistrant.findMany({
        where: { eventId, ...unassignedCandidateWhere(eventId) },
        orderBy: { createdAt: "asc" },
        take: MAX_BREAKOUT_CANDIDATES,
        select: {
          id: true,
          memberId: true,
          mobileNumber: true,
          ...registrantNameSelect,
          member: {
            select: {
              firstName: true,
              lastName: true,
              ...CANDIDATE_PERSON_SELECT,
              schedulePreferences: {
                select: { dayOfWeek: true, timeStart: true, timeEnd: true },
              },
            },
          },
          guest: {
            select: {
              firstName: true,
              lastName: true,
              ...CANDIDATE_PERSON_SELECT,
              scheduleDayOfWeek: true,
              scheduleTimeStart: true,
              scheduleTimeEnd: true,
            },
          },
        },
      }),
      db.eventRegistrant.count({ where: { eventId, ...unassignedCandidateWhere(eventId) } }),
      getEffectiveFormConfigs(eventId),
      db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
      db.ageRangeBucket.findMany({
        orderBy: { order: "asc" },
        // Bounds included: picking a bucket in the picker sets the age window.
        select: { id: true, label: true, minAge: true, maxAge: true },
      }),
    ])

    // Built from the rows we already have rather than re-read by the matching
    // layer, and via the engine's own builder so the schedule normalization the
    // day filter sees is byte-for-byte what the scorer saw.
    const profiles = new Map(rows.map((r) => [r.id, buildCandidateFromRegistrant(r)]))
    const matches = await scoreCandidatesForBreakout(groupId, eventId, profiles)
    const byRegistrant = new Map(matches.map((m) => [m.registrantId, m]))

    const candidates: BreakoutCandidate[] = rows.map((r) => {
      const person = r.member ?? r.guest
      const match = byRegistrant.get(r.id)
      const profile = profiles.get(r.id)

      return {
        registrantId: r.id,
        name: registrantName(r, "Unknown"),
        mobileNumber: r.mobileNumber,
        isMember: r.memberId !== null,
        isAnonymous: person === null,
        demographics: {
          lifeStageId: person?.lifeStageId ?? null,
          gender: person?.gender ?? null,
          language: person?.language ?? [],
          birthMonth: person?.birthMonth ?? null,
          birthYear: person?.birthYear ?? null,
          // Carried alongside rather than inside CandidateProfile: that type is
          // serialized to the public join page and holds no id or label.
          ageRangeBucket: person?.ageRangeBucket ?? null,
          workCity: person?.workCity ?? null,
          meetingPreference: person?.meetingPreference ?? null,
          scheduleSlots: profile?.scheduleSlots ?? [],
        },
        score: match?.result.totalScore ?? 0,
        confidence: match?.result.confidence ?? 0,
        passesGates: match?.passesGates ?? false,
      }
    })

    return {
      success: true,
      data: {
        criteria: {
          lifeStageIds: group.lifeStages.map((ls) => ls.id),
          // Resolved here, not on the client: the page's group query carries
          // neither facilitator gender nor the linked small group's focus.
          genderFocus: deriveEffectiveGenderFocus(
            group.genderFocus,
            group.facilitator?.member.gender,
            group.coFacilitator?.member.gender,
            group.linkedSmallGroup?.genderFocus
          ),
          language: group.language,
          ageRangeMin: group.ageRangeMin,
          ageRangeMax: group.ageRangeMax,
          meetingFormat: group.meetingFormat,
          locationCity: group.locationCity,
          scheduleDayOfWeek: group.schedules[0]?.dayOfWeek ?? null,
        },
        formConfig: mergeFormConfigs(formConfigs),
        lifeStages,
        ageRangeBuckets,
        candidates,
        // Past the cap the picker tells the admin to narrow with search rather
        // than silently pretending the extra people don't exist.
        totalPool,
        truncated: totalPool > rows.length,
        memberLimit: group.memberLimit,
        currentCount: group._count.members,
      },
    }
  } catch {
    return { success: false, error: "Failed to load breakout candidates" }
  }
}

export async function findBreakoutGroupMatches(
  registrantId: string,
  eventId: string
): Promise<ActionResult<MatchResult[]>> {
  const denied = await requireEventRead(eventId)
  if (denied) return { success: false, error: denied.error }

  try {
    const results = await matchBreakoutGroups(registrantId, eventId, {
      excludeAssigned: true,
      limit: 5,
    })
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute breakout matches" }
  }
}

/**
 * Place one registrant into a breakout group, from the registrant detail page.
 *
 * Delegates to the batch action rather than re-implementing the placement
 * rules. This used to be its own copy that checked only capacity — no auth, no
 * event scoping (it would happily put event A's registrant in event B's group,
 * which then hid them from their own event's candidate pool) and no CCF-87
 * facilitator guard. Routing both entry points through one implementation is
 * what keeps those guards from drifting apart again.
 */
export async function assignRegistrantToBreakout(
  groupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult<void>> {
  const result = await addRegistrantsToBreakout(groupId, [registrantId], eventId)
  if (!result.success) return result

  const [failure] = result.data.failed
  if (failure) return { success: false, error: `${failure.name} ${failure.reason}` }

  return { success: true, data: undefined }
}
