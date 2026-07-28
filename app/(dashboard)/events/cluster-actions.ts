"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"
import { getClusterFormConfig } from "@/lib/forms/context-config-server"
import { sanitizeRegistrantPayload } from "@/lib/forms/registration-payload"
import {
  completeEventRegistration,
  findEventVolunteerConflict,
  findExistingEventRegistration,
  resolveAnonymousGuest,
  resolveConfirmedGuest,
  resolveConfirmedMember,
  type AssignedBreakout,
  type PersonRef,
  type ResolvedProfile,
} from "@/lib/events/registration-core"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  eventClusterSchema,
  eventClusterSettingsSchema,
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

    // Drop undefined so an omitted field doesn't overwrite a stored value.
    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    )
    await db.eventCluster.update({ where: { id: clusterId }, data })
    revalidateClusterPaths(clusterId)
    revalidatePath(`/register/c/${cluster.publicToken}`)
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
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const [cluster, event] = await Promise.all([
      db.eventCluster.findUnique({ where: { id: clusterId }, select: { id: true } }),
      db.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          modules: { select: { type: true } },
          clusterMembership: { select: { clusterId: true } },
        },
      }),
    ])
    if (!cluster) return { success: false, error: "Event cluster not found." }
    if (!event) return { success: false, error: "Event not found." }

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

    const last = await db.eventClusterEvent.findFirst({
      where: { clusterId },
      orderBy: { order: "desc" },
      select: { order: true },
    })
    await db.eventClusterEvent.create({
      data: { clusterId, eventId, order: (last?.order ?? -1) + 1 },
    })
    revalidateClusterPaths(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add the event to the cluster." }
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
  /** Walk-in mode only: the person was checked in on this event (OneTime). */
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
 * Walk-in mode (cluster check-in board): exempt from the cluster window, reuses
 * existing registrations, and immediately checks the person in — but only on
 * OneTime events (attendedAt). MultiDay/Recurring events are registered without
 * a session check-in (deferred per the ticket decision).
 */
export async function registerForCluster(
  publicToken: string,
  raw: z.input<typeof registrantSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId: string | null | undefined,
  skipDeduplication: boolean | undefined,
  selectedEventIds: string[],
  walkIn?: boolean
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

    // ── Resolve the person ONCE ─────────────────────────────────────────────
    let person: PersonRef
    let profile: ResolvedProfile
    if (confirmedMemberId) {
      const stored = await resolveConfirmedMember(confirmedMemberId, parsed.data)
      person = { memberId: confirmedMemberId }
      profile = {
        gender: (parsed.data.gender ?? stored.gender) as Gender | null,
        birthYear: parsed.data.birthYear ?? stored.birthYear,
      }
    } else if (confirmedGuestId) {
      const stored = await resolveConfirmedGuest(confirmedGuestId, parsed.data)
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
          results.push({
            eventId,
            eventName: event.name,
            status: "already",
            registrantId: existingRegistrationId,
          })
          continue
        }

        // Cluster check-in is OneTime-only: walk-ins check in via attendedAt.
        // MultiDay/Recurring events are registered without a session check-in
        // (their own sessions pages handle attendance).
        const walkInForEvent =
          walkIn && event.type === "OneTime" ? { occurrenceId: null } : null

        const completed = await completeEventRegistration({
          eventId,
          person,
          data: parsed.data,
          breakoutPick: null, // manual picker is omitted on the cluster form; auto-assign still runs
          profile,
          clusterId: cluster.id,
          walkIn: walkInForEvent,
          existingRegistrantId: existingRegistrationId,
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
  } catch {
    return { success: false, error: "Failed to register. Please try again." }
  }
}
