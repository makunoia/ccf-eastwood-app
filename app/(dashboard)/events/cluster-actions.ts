"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { ProfileCollisionError } from "@/lib/events/profile-merge"
import { verifyIdentityGrant } from "@/lib/security/identity-grant"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"
import { getClusterFormConfig } from "@/lib/forms/context-config-server"
import {
  askedFieldsFor,
  missingRequiredFields,
  requiredFieldsMessage,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import {
  completeEventRegistration,
  findEventVolunteerConflict,
  findExistingEventRegistration,
  resolveAnonymousGuest,
  resolveConfirmedGuest,
  resolveConfirmedMember,
  type TouchedFields,
  stampClusterProvenance,
  type AssignedBreakout,
  type PersonRef,
  type ResolvedProfile,
} from "@/lib/events/registration-core"
import {
  buildNameMatcher,
  findEventRegistrantsForLookup,
  findEventVolunteersForLookup,
  matchesContactQuery,
  recordCheckinAttendance,
  registrantContact,
  registrantIdentityKey,
  registrantName,
} from "@/lib/events/checkin-lookup"
import { contactHintFrom } from "@/lib/contact-hint"
import {
  getClusterEvents,
  resolveClusterCheckinTargets,
} from "@/lib/clusters/aggregate"
import {
  buildClusterCheckinPeople,
  skipReasonFor,
  type ClusterCheckinPerson,
  type ClusterCheckinSkipReason,
  type ClusterCheckinSubjectRow,
  type ClusterCheckinTarget,
} from "@/lib/clusters/checkin-person"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  eventClusterSchema,
  eventClusterSettingsSchema,
  isSameUtcDay,
  validateClusterEventLink,
  validateClusterEventSelection,
  type EventClusterInput,
  type EventClusterSettingsInput,
} from "@/lib/validations/event-cluster"
import type { Gender } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

function revalidateClusterPaths(clusterId: string) {
  revalidatePath("/events/clusters")
  revalidatePath(`/cluster/${clusterId}`)
  revalidatePath(`/cluster/${clusterId}/registrants`)
  revalidatePath(`/cluster/${clusterId}/checkin`)
  revalidatePath(`/cluster/${clusterId}/settings`)
}

// ─── Cluster CRUD (Workstream A) ─────────────────────────────────────────────

export async function createEventCluster(
  raw: EventClusterInput
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = eventClusterSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const cluster = await db.eventCluster.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        date: parsed.data.date,
      },
      select: { id: true },
    })
    revalidatePath("/events/clusters")
    return { success: true, data: { id: cluster.id } }
  } catch {
    return { success: false, error: "Failed to create the event cluster." }
  }
}

export async function updateEventCluster(
  clusterId: string,
  raw: EventClusterSettingsInput
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = eventClusterSettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const cluster = await db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { publicToken: true },
    })
    if (!cluster) return { success: false, error: "Event cluster not found." }

    // Moving the day must not leave a picked session behind on the old date.
    // Only links that name a session are checked: links made before session
    // selection existed carry no such claim, so they never block an edit.
    if (parsed.data.date) {
      const newDate = parsed.data.date
      const linked = await db.eventClusterEvent.findMany({
        where: { clusterId, occurrenceId: { not: null } },
        select: {
          event: { select: { name: true } },
          occurrence: { select: { date: true } },
        },
      })
      const stranded = linked.filter(
        (l) => l.occurrence && !isSameUtcDay(l.occurrence.date, newDate)
      )
      if (stranded.length > 0) {
        const names = stranded.map((l) => l.event.name).join(", ")
        return {
          success: false,
          error: `${names} ${stranded.length === 1 ? "is" : "are"} pinned to a session on another date. Change the session first, then move the day.`,
        }
      }
    }

    // Drop undefined so an omitted field doesn't overwrite a stored value.
    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    )
    await db.eventCluster.update({ where: { id: clusterId }, data })
    revalidateClusterPaths(clusterId)
    revalidatePath(`/register/c/${cluster.publicToken}`)
    revalidatePath(`/register/c/${cluster.publicToken}/walk-in`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update the event cluster." }
  }
}

export async function deleteEventCluster(clusterId: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventCluster.delete({ where: { id: clusterId } })
    revalidatePath("/events/clusters")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete the event cluster." }
  }
}

export async function addEventToCluster(
  clusterId: string,
  eventId: string,
  /** Which session this day stands for — required for Recurring events. */
  occurrenceId?: string | null
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const [cluster, event, occurrence] = await Promise.all([
      db.eventCluster.findUnique({
        where: { id: clusterId },
        select: { id: true, date: true },
      }),
      db.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          modules: { select: { type: true } },
          clusterMembership: { select: { clusterId: true } },
        },
      }),
      occurrenceId
        ? db.eventOccurrence.findUnique({
            where: { id: occurrenceId },
            select: { id: true, eventId: true, date: true },
          })
        : null,
    ])
    if (!cluster) return { success: false, error: "Event cluster not found." }
    if (!event) return { success: false, error: "Event not found." }
    if (occurrenceId && !occurrence) {
      return { success: false, error: "Session not found." }
    }

    // Paid events are out of scope for clusters (no payment step on the shared
    // form) — they keep using their own per-event registration form.
    if (event.modules.some((m) => m.type === "Priced")) {
      return {
        success: false,
        error: `${event.name} is a paid event. Paid events can't join a cluster — they keep their own registration form.`,
      }
    }
    if (event.clusterMembership) {
      return {
        success: false,
        error:
          event.clusterMembership.clusterId === clusterId
            ? `${event.name} is already in this cluster.`
            : `${event.name} already belongs to another cluster. An event can only be in one.`,
      }
    }

    const linkCheck = validateClusterEventLink({
      eventId: event.id,
      eventName: event.name,
      eventType: event.type,
      eventStartDate: event.startDate,
      clusterDate: cluster.date,
      session: occurrence,
    })
    if (!linkCheck.ok) return { success: false, error: linkCheck.error }

    const last = await db.eventClusterEvent.findFirst({
      where: { clusterId },
      orderBy: { order: "desc" },
      select: { order: true },
    })
    await db.eventClusterEvent.create({
      data: {
        clusterId,
        eventId,
        order: (last?.order ?? -1) + 1,
        occurrenceId: occurrence?.id ?? null,
      },
    })
    revalidateClusterPaths(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add the event to the cluster." }
  }
}

/**
 * Re-point a linked Recurring event at a different session. The dashboard,
 * roster, check-in board, and export all scope to the link's session, so
 * changing it here changes what every one of those screens shows.
 */
export async function setClusterEventSession(
  clusterId: string,
  eventId: string,
  occurrenceId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const [cluster, link, occurrence] = await Promise.all([
      db.eventCluster.findUnique({
        where: { id: clusterId },
        select: { id: true, date: true },
      }),
      db.eventClusterEvent.findUnique({
        where: { clusterId_eventId: { clusterId, eventId } },
        select: {
          event: { select: { id: true, name: true, type: true, startDate: true } },
        },
      }),
      db.eventOccurrence.findUnique({
        where: { id: occurrenceId },
        select: { id: true, eventId: true, date: true },
      }),
    ])
    if (!cluster) return { success: false, error: "Event cluster not found." }
    if (!link) return { success: false, error: "That event isn't in this cluster." }
    if (!occurrence) return { success: false, error: "Session not found." }

    const linkCheck = validateClusterEventLink({
      eventId: link.event.id,
      eventName: link.event.name,
      eventType: link.event.type,
      eventStartDate: link.event.startDate,
      clusterDate: cluster.date,
      session: occurrence,
    })
    if (!linkCheck.ok) return { success: false, error: linkCheck.error }

    await db.eventClusterEvent.update({
      where: { clusterId_eventId: { clusterId, eventId } },
      data: { occurrenceId },
    })
    revalidateClusterPaths(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to change the session." }
  }
}

export async function removeEventFromCluster(
  clusterId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    // Registrants keep their event linkage — removing an event from a cluster
    // never cascades into registrations.
    await db.eventClusterEvent.delete({
      where: { clusterId_eventId: { clusterId, eventId } },
    })
    revalidateClusterPaths(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove the event from the cluster." }
  }
}

// ─── Shared-form fan-out (Workstream C) ──────────────────────────────────────

export type ClusterEventRegistrationResult = {
  eventId: string
  eventName: string
  status:
    | "registered" // new registration created
    | "already" // was already registered (walk-in reuses & still checks in)
    | "closed" // that event's own registration window has passed
    | "volunteer" // serving as a volunteer at that event
    | "failed" // unexpected per-event failure
  registrantId?: string
  breakoutGroup?: AssignedBreakout
  /** Walk-in mode only: the person was checked in on this event. */
  checkedIn?: boolean
}

/**
 * Register one person for several events of a cluster in a single submission.
 *
 * The person is resolved exactly once (the central CCF-132 refactor) — the same
 * `memberId`/`guestId` is reused for every selected event, so the fan-out can
 * never create duplicate Guests or repeat member promotion. Per-event outcomes
 * are collected individually: one event being closed or already-registered must
 * not sink the others (partial success).
 *
 * Walk-in mode (the door link): exempt from the cluster window, reuses existing
 * registrations, and checks the person in immediately — on a OneTime event via
 * `attendedAt`, and on a Recurring event via the session its cluster link names.
 * A Recurring event whose link has no session is registered without check-in:
 * there is no way to know which occurrence the person is standing in front of,
 * which is exactly the ambiguity session selection removes.
 */
export async function registerForCluster(
  publicToken: string,
  raw: z.input<typeof registrantSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId: string | null | undefined,
  skipDeduplication: boolean | undefined,
  selectedEventIds: string[],
  walkIn?: boolean,
  /** Review-screen edits (CCF-147) — these overwrite the stored profile. */
  touchedFields?: TouchedFields,
  /** Proof of record ownership; without it `touchedFields` is ignored. */
  grant?: string | null
): Promise<ActionResult<{ results: ClusterEventRegistrationResult[] }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const cluster = await db.eventCluster.findUnique({
      where: { publicToken },
      select: {
        id: true,
        isOpen: true,
        registrationStart: true,
        registrationEnd: true,
        events: {
          orderBy: { order: "asc" },
          select: {
            occurrenceId: true,
            event: {
              select: {
                id: true,
                name: true,
                type: true,
                registrationStart: true,
                registrationEnd: true,
              },
            },
          },
        },
      },
    })
    if (!cluster) return { success: false, error: "Event day not found." }

    // Cluster-level open/close governs the shared form. Walk-ins are exempt:
    // they're staff-supervised at the door (same rule as per-event walk-ins).
    if (!walkIn) {
      if (
        !cluster.isOpen ||
        !isWithinRegistrationWindow(cluster.registrationStart, cluster.registrationEnd)
      ) {
        return { success: false, error: "Registration for this event day is closed." }
      }
    }

    const clusterEvents = cluster.events.map((ce) => ce.event)
    /** The session each event's cluster link names — the walk-in check-in target. */
    const linkedSessionByEvent = new Map(
      cluster.events.map((ce) => [ce.event.id, ce.occurrenceId])
    )
    const selection = validateClusterEventSelection(
      selectedEventIds,
      clusterEvents.map((e) => e.id)
    )
    if (!selection.ok) return { success: false, error: selection.error }

    // Enforce the cluster's shared form config server-side — same crafted-POST
    // defense as the per-event form, but against the CLUSTER's config: profile
    // writes happen once here, before any per-event call.
    const formConfig = await getClusterFormConfig(cluster.id, walkIn ? "WalkIn" : "Register")
    Object.assign(parsed.data, sanitizeRegistrantPayload(formConfig, parsed.data))
    // Checked after sanitizing, so a value sent for a disabled field can't
    // satisfy a stale required flag on that same field.
    const missing = missingRequiredFields(
      formConfig,
      parsed.data,
      askedFieldsFor(walkIn ? "WalkIn" : "Register", parsed.data)
    )
    if (missing.length > 0) {
      return { success: false, error: requiredFieldsMessage(missing) }
    }

    // ── Resolve the person ONCE ─────────────────────────────────────────────
    // Overwriting a stored profile field takes proof that the caller owns the
    // record — see `grantedTouchedFields` in ./actions.ts. The grant is scoped to
    // the record rather than an event precisely so it survives this fan-out.
    let person: PersonRef
    let profile: ResolvedProfile
    let touched: TouchedFields = null
    if (confirmedMemberId) {
      touched = verifyIdentityGrant(grant, { recordId: confirmedMemberId, recordType: "member" })
        ? touchedFields
        : null
      const stored = await resolveConfirmedMember(confirmedMemberId, parsed.data, touched)
      person = { memberId: confirmedMemberId }
      profile = {
        gender: (parsed.data.gender ?? stored.gender) as Gender | null,
        birthYear: parsed.data.birthYear ?? stored.birthYear,
      }
    } else if (confirmedGuestId) {
      touched = verifyIdentityGrant(grant, { recordId: confirmedGuestId, recordType: "guest" })
        ? touchedFields
        : null
      const stored = await resolveConfirmedGuest(confirmedGuestId, parsed.data, touched)
      person = { guestId: confirmedGuestId }
      profile = {
        gender: (parsed.data.gender ?? stored.gender) as Gender | null,
        birthYear: parsed.data.birthYear ?? stored.birthYear,
      }
    } else {
      const { guestId } = await resolveAnonymousGuest(parsed.data, skipDeduplication)
      person = { guestId, nickname: parsed.data.nickname ?? null }
      profile = {
        gender: (parsed.data.gender ?? null) as Gender | null,
        birthYear: parsed.data.birthYear ?? null,
      }
    }

    // ── Fan out per selected event (partial success) ────────────────────────
    const results: ClusterEventRegistrationResult[] = []
    const eventsById = new Map(clusterEvents.map((e) => [e.id, e]))
    for (const eventId of selection.eventIds) {
      const event = eventsById.get(eventId)!
      try {
        // Per-event windows still apply inside the fan-out (walk-ins exempt).
        if (
          !walkIn &&
          !isWithinRegistrationWindow(event.registrationStart, event.registrationEnd)
        ) {
          results.push({ eventId, eventName: event.name, status: "closed" })
          continue
        }

        if ("memberId" in person && (await findEventVolunteerConflict(eventId, person.memberId))) {
          results.push({ eventId, eventName: event.name, status: "volunteer" })
          continue
        }

        const existingRegistrationId = await findExistingEventRegistration(eventId, person)
        if (existingRegistrationId && !walkIn) {
          // Already registered, so there is nothing to create — but they DID just
          // sign up for this day, and the day roll-up reads that from the
          // provenance column. Stamping it here is the whole difference between
          // the roster placing them on the day and drawing "—": the stamp used to
          // live only past this `continue`, on the reuse branch of
          // `completeEventRegistration`, so an existing registration could never
          // acquire one — and registering again, the obvious thing for an admin
          // to try, ran straight back into the same short-circuit.
          //
          // Only the stamp is repeated. Breakout assignment and the DGroup seeker
          // request stay on the far side: those happened when the person first
          // registered, and re-running them would double-file the same person.
          await stampClusterProvenance(existingRegistrationId, cluster.id)
          results.push({
            eventId,
            eventName: event.name,
            status: "already",
            registrantId: existingRegistrationId,
          })
          continue
        }

        // Where a walk-in's attendance lands. OneTime events have no sessions, so
        // it's `attendedAt` (occurrenceId null). A Recurring event checks in on
        // the session its cluster link names — the whole point of naming one. An
        // unlinked Recurring event (or a legacy MultiDay link) still can't say
        // WHICH occurrence the person is at, so it registers without check-in.
        const linkedSession = linkedSessionByEvent.get(event.id) ?? null
        const walkInForEvent = !walkIn
          ? null
          : event.type === "OneTime"
            ? { occurrenceId: null }
            : event.type === "Recurring" && linkedSession
              ? { occurrenceId: linkedSession }
              : null

        const completed = await completeEventRegistration({
          eventId,
          person,
          data: parsed.data,
          breakoutPick: null, // manual picker is omitted on the cluster form; auto-assign still runs
          profile,
          clusterId: cluster.id,
          walkIn: walkInForEvent,
          existingRegistrantId: existingRegistrationId,
          touchedFields: touched,
        })
        results.push({
          eventId,
          eventName: event.name,
          status: existingRegistrationId ? "already" : "registered",
          registrantId: completed.id,
          breakoutGroup: completed.breakoutGroup,
          checkedIn: walkInForEvent !== null,
        })
        revalidatePath(`/event/${eventId}/registrants`)
      } catch {
        results.push({ eventId, eventName: event.name, status: "failed" })
      }
    }

    revalidateClusterPaths(cluster.id)
    return { success: true, data: { results } }
  } catch (error) {
    // Person resolution happens once, before the fan-out, so a contact collision
    // sinks the whole submission rather than producing per-event partials — and
    // has to reach the person as itself, not as "please try again".
    if (error instanceof ProfileCollisionError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to register. Please try again." }
  }
}

// ─── Cluster check-in kiosk ──────────────────────────────────────────────────
//
// The day's check-in door. Where the per-event kiosk finds one subject on one
// event, this finds one *person* across every event of the day and records their
// attendance on all of them in a single tap.
//
// Public, like every other check-in action — the kiosk runs with no session. The
// safety comes from re-deriving everything server-side from the token: the caller
// supplies a person key and nothing else, so an id belonging to an event outside
// this cluster resolves to nothing. (`markCheckinAttendance` takes a bare subject
// id and is unscoped; that pattern is deliberately not repeated here.)

export type ClusterCheckinLookupResult =
  | { matchType: "one"; person: ClusterCheckinPerson }
  | { matchType: "ambiguous"; candidates: ClusterCheckinPerson[] }

type ClusterCheckinContext = {
  cluster: { id: string; name: string; checkInIsOpen: boolean }
  targets: ClusterCheckinTarget[]
  occurrenceByEvent: Map<string, string | null>
  eventIds: string[]
}

async function loadClusterCheckinContext(
  token: string
): Promise<ClusterCheckinContext | null> {
  const cluster = await db.eventCluster.findUnique({
    where: { publicToken: token },
    select: { id: true, name: true, date: true, checkInIsOpen: true },
  })
  if (!cluster) return null

  // No session here, so the whole day is in scope — permission filtering is for
  // the authenticated workspace, not for the person standing at the door.
  const events = await getClusterEvents(cluster.id)
  const resolved = await resolveClusterCheckinTargets(events, cluster.date)

  return {
    cluster: {
      id: cluster.id,
      name: cluster.name,
      checkInIsOpen: cluster.checkInIsOpen,
    },
    targets: resolved.map(({ shortcut, occurrenceId }) => ({
      eventId: shortcut.eventId,
      eventName: shortcut.eventName,
      status: shortcut.status,
      occurrenceId,
    })),
    occurrenceByEvent: new Map(
      resolved.map(({ shortcut, occurrenceId }) => [shortcut.eventId, occurrenceId])
    ),
    eventIds: events.map((e) => e.id),
  }
}

/**
 * Which of the matched subjects already have attendance for the day, keyed
 * `<kind>:<id>@<eventId>`. One batched read rather than the per-candidate
 * lookups the single-event path does — a cluster multiplies those by the number
 * of events *and* the number of candidates.
 */
async function loadClusterAttendance(
  ctx: ClusterCheckinContext,
  registrants: { id: string; eventId: string; attendedAt: Date | null }[],
  volunteers: { id: string; eventId: string | null; attendedAt: Date | null }[]
): Promise<Set<string>> {
  const checkedIn = new Set<string>()

  // OneTime events have no occurrence; presence is the flat `attendedAt` stamp.
  for (const r of registrants) {
    if (ctx.occurrenceByEvent.get(r.eventId) == null && r.attendedAt !== null) {
      checkedIn.add(`registrant:${r.id}@${r.eventId}`)
    }
  }
  for (const v of volunteers) {
    if (v.eventId && ctx.occurrenceByEvent.get(v.eventId) == null && v.attendedAt !== null) {
      checkedIn.add(`volunteer:${v.id}@${v.eventId}`)
    }
  }

  const occurrenceIds = ctx.targets
    .map((t) => t.occurrenceId)
    .filter((id): id is string => id !== null)
  if (occurrenceIds.length === 0) return checkedIn

  const eventByOccurrence = new Map(
    ctx.targets
      .filter((t) => t.occurrenceId !== null)
      .map((t) => [t.occurrenceId as string, t.eventId])
  )
  const rows = await db.occurrenceAttendee.findMany({
    where: {
      occurrenceId: { in: occurrenceIds },
      OR: [
        { registrantId: { in: registrants.map((r) => r.id) } },
        { volunteerId: { in: volunteers.map((v) => v.id) } },
      ],
    },
    select: { occurrenceId: true, registrantId: true, volunteerId: true },
  })
  for (const row of rows) {
    const eventId = eventByOccurrence.get(row.occurrenceId)
    if (!eventId) continue
    if (row.registrantId) checkedIn.add(`registrant:${row.registrantId}@${eventId}`)
    if (row.volunteerId) checkedIn.add(`volunteer:${row.volunteerId}@${eventId}`)
  }
  return checkedIn
}

/** Matched rows → the pure builder's input shape. */
async function buildPeopleFromMatches(
  ctx: ClusterCheckinContext,
  matchedRegistrants: Awaited<ReturnType<typeof findEventRegistrantsForLookup>>,
  matchedVolunteers: Awaited<ReturnType<typeof findEventVolunteersForLookup>>
): Promise<ClusterCheckinPerson[]> {
  const checkedIn = await loadClusterAttendance(ctx, matchedRegistrants, matchedVolunteers)

  const rows: ClusterCheckinSubjectRow[] = []

  for (const r of matchedRegistrants) {
    const { firstName, lastName } = registrantName(r)
    const contact = registrantContact(r)
    rows.push({
      key: registrantIdentityKey(r),
      eventId: r.eventId,
      subject: { kind: "registrant", id: r.id },
      alreadyCheckedIn: checkedIn.has(`registrant:${r.id}@${r.eventId}`),
      firstName,
      lastName,
      // The per-event nickname wins; otherwise fall back to the one on the profile.
      nickname: r.nickname ?? r.member?.nickname ?? r.guest?.nickname ?? null,
      contactHint: contactHintFrom(contact.phone, contact.email),
      isMember: r.memberId !== null,
    })
  }

  for (const v of matchedVolunteers) {
    if (!v.eventId) continue
    rows.push({
      key: `member:${v.memberId}`,
      eventId: v.eventId,
      subject: { kind: "volunteer", id: v.id },
      alreadyCheckedIn: checkedIn.has(`volunteer:${v.id}@${v.eventId}`),
      firstName: v.member.firstName,
      lastName: v.member.lastName,
      nickname: v.member.nickname,
      contactHint: contactHintFrom(v.member.phone, v.member.email),
      isMember: true,
    })
  }

  return buildClusterCheckinPeople(ctx.targets, rows)
}

/** Exact mobile/email match across the whole day. */
export async function lookupClusterCheckin(
  token: string,
  query: string
): Promise<ActionResult<ClusterCheckinLookupResult | null>> {
  const q = query.trim()
  if (!q) return { success: true, data: null }

  try {
    const ctx = await loadClusterCheckinContext(token)
    if (!ctx) return { success: false, error: "Event day not found." }
    if (!ctx.cluster.checkInIsOpen) {
      return { success: false, error: "Check-in is closed." }
    }
    if (ctx.eventIds.length === 0) return { success: true, data: null }

    const [allRegistrants, allVolunteers] = await Promise.all([
      findEventRegistrantsForLookup(ctx.eventIds),
      findEventVolunteersForLookup(ctx.eventIds),
    ])
    const people = await buildPeopleFromMatches(
      ctx,
      allRegistrants.filter((r) => matchesContactQuery(registrantContact(r), q)),
      allVolunteers.filter((v) =>
        matchesContactQuery({ email: v.member.email, phone: v.member.phone }, q)
      )
    )

    if (people.length === 0) return { success: true, data: null }
    if (people.length > 1) {
      return { success: true, data: { matchType: "ambiguous", candidates: people } }
    }
    return { success: true, data: { matchType: "one", person: people[0] } }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
}

/** Name search across the whole day, for the kiosk's type-ahead. */
export async function searchClusterCheckinByName(
  token: string,
  query: string
): Promise<ActionResult<ClusterCheckinPerson[]>> {
  const nameContains = buildNameMatcher(query)
  if (!nameContains) return { success: true, data: [] }

  try {
    const ctx = await loadClusterCheckinContext(token)
    if (!ctx) return { success: false, error: "Event day not found." }
    if (!ctx.cluster.checkInIsOpen) {
      return { success: false, error: "Check-in is closed." }
    }
    if (ctx.eventIds.length === 0) return { success: true, data: [] }

    const [allRegistrants, allVolunteers] = await Promise.all([
      findEventRegistrantsForLookup(ctx.eventIds),
      findEventVolunteersForLookup(ctx.eventIds),
    ])
    const people = await buildPeopleFromMatches(
      ctx,
      allRegistrants.filter((r) => {
        const { firstName, lastName } = registrantName(r)
        return nameContains(firstName, lastName, [
          r.nickname,
          r.member?.nickname ?? null,
          r.guest?.nickname ?? null,
        ])
      }),
      allVolunteers.filter((v) =>
        nameContains(v.member.firstName, v.member.lastName, [v.member.nickname])
      )
    )

    return { success: true, data: people.slice(0, 15) }
  } catch {
    return { success: false, error: "Search failed. Please try again." }
  }
}

export type ClusterCheckinOutcome = {
  person: ClusterCheckinPerson
  recorded: { eventId: string; eventName: string }[]
  skipped: {
    eventId: string
    eventName: string
    reason: ClusterCheckinSkipReason
  }[]
}

/**
 * Record the person's attendance across every event of the day that will take it.
 *
 * Takes a person key, never a registrant or volunteer id: the rows are re-resolved
 * from the cluster's own events, so a forged or stale key simply finds nobody.
 * Every write is idempotent, so a double tap changes nothing.
 */
export async function checkInToCluster(
  token: string,
  personKey: string
): Promise<ActionResult<ClusterCheckinOutcome>> {
  if (!personKey.trim()) return { success: false, error: "No one selected." }

  try {
    const ctx = await loadClusterCheckinContext(token)
    if (!ctx) return { success: false, error: "Event day not found." }
    if (!ctx.cluster.checkInIsOpen) {
      return { success: false, error: "Check-in is closed." }
    }
    if (ctx.eventIds.length === 0) {
      return { success: false, error: "This day has no events yet." }
    }

    const [allRegistrants, allVolunteers] = await Promise.all([
      findEventRegistrantsForLookup(ctx.eventIds),
      findEventVolunteersForLookup(ctx.eventIds),
    ])
    const people = await buildPeopleFromMatches(
      ctx,
      allRegistrants.filter((r) => registrantIdentityKey(r) === personKey),
      allVolunteers.filter((v) => `member:${v.memberId}` === personKey)
    )
    const person = people[0]
    if (!person) return { success: false, error: "We couldn't find that person." }

    const recorded: ClusterCheckinOutcome["recorded"] = []
    const skipped: ClusterCheckinOutcome["skipped"] = []

    for (const cell of person.events) {
      const reason = skipReasonFor(cell)
      if (reason !== null) {
        skipped.push({ eventId: cell.eventId, eventName: cell.eventName, reason })
        continue
      }
      await recordCheckinAttendance(
        cell.subject as { kind: "registrant" | "volunteer"; id: string },
        ctx.occurrenceByEvent.get(cell.eventId) ?? null
      )
      recorded.push({ eventId: cell.eventId, eventName: cell.eventName })
      revalidatePath(`/event/${cell.eventId}/checkin`)
    }

    revalidateClusterPaths(ctx.cluster.id)

    // Re-read so the caller's screen shows what is now true, not what was true
    // before the writes.
    return {
      success: true,
      data: {
        person: {
          ...person,
          events: person.events.map((cell) =>
            recorded.some((r) => r.eventId === cell.eventId)
              ? { ...cell, alreadyCheckedIn: true }
              : cell
          ),
        },
        recorded,
        skipped,
      },
    }
  } catch {
    return { success: false, error: "Failed to check in. Please try again." }
  }
}
