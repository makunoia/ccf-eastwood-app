import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { LATEST_SESSION_FIRST } from "@/lib/events/walk-in-session"
import { formatOccurrenceDate } from "@/lib/format/occurrence"

export type SessionTarget = { eventId: string; occurrenceId: string | null; label: string }
export class SessionTargetChanged extends Error {
  constructor(public targets: SessionTarget[]) {
    super("The session has changed. Please review the session below and submit again.")
  }
}

/** Shared forms own their setting and pin; event forms follow their active session. */
export async function registrationSessionTargets(eventId?: string, clusterId?: string): Promise<SessionTarget[] | null> {
  if (clusterId) {
    const cluster = await db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { sessionRegistrationEnabled: true, events: { select: {
        event: { select: { id: true, name: true, type: true } },
        occurrence: { select: { id: true, date: true } },
      } } },
    })
    if (!cluster?.sessionRegistrationEnabled) return null
    return cluster.events.filter((link) => link.event.type !== "OneTime").map((link) => ({
      eventId: link.event.id, occurrenceId: link.occurrence?.id ?? null,
      label: `${link.event.name} · ${link.occurrence ? formatOccurrenceDate(link.occurrence.date) : "No session linked"}`,
    }))
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: {
    id: true, name: true, type: true, sessionRegistrationEnabled: true,
  } })
  if (!event?.sessionRegistrationEnabled || event.type === "OneTime") return null
  const session = await db.eventOccurrence.findFirst({ where: { eventId }, orderBy: [...LATEST_SESSION_FIRST], select: { id: true, date: true } })
  return [{ eventId: event.id, occurrenceId: session?.id ?? null,
    label: `${event.name} · ${session ? formatOccurrenceDate(session.date) : "No session available"}` }]
}

export function validateSessionTargets(targets: SessionTarget[] | null, displayed: Record<string, string | null> | undefined, eventIds: string[]) {
  if (!targets) return
  const selected = targets.filter((t) => eventIds.includes(t.eventId))
  if (selected.some((t) => !t.occurrenceId || displayed?.[t.eventId] !== t.occurrenceId)) {
    throw new SessionTargetChanged(targets)
  }
}

/** Recheck the target inside the registration transaction, including configuration races. */
export async function assertSessionTarget(tx: Prisma.TransactionClient, eventId: string, occurrenceId: string, clusterId?: string | null) {
  const occurrence = await tx.eventOccurrence.findFirst({ where: { id: occurrenceId, eventId }, select: { id: true } })
  let valid = !!occurrence
  if (clusterId) {
    const link = await tx.eventClusterEvent.findUnique({ where: { clusterId_eventId: { clusterId, eventId } }, select: {
      occurrenceId: true, cluster: { select: { sessionRegistrationEnabled: true } },
    } })
    valid = valid && !!link?.cluster.sessionRegistrationEnabled && link.occurrenceId === occurrenceId
  } else {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { sessionRegistrationEnabled: true } })
    const latest = await tx.eventOccurrence.findFirst({ where: { eventId }, orderBy: [...LATEST_SESSION_FIRST], select: { id: true } })
    valid = valid && !!event?.sessionRegistrationEnabled && latest?.id === occurrenceId
  }
  if (!valid) throw new SessionTargetChanged(await registrationSessionTargets(eventId, clusterId ?? undefined) ?? [])
}

/** Participant session registration overrides serving for this occurrence only. */
export async function sessionParticipantForVolunteer(tx: Prisma.TransactionClient, occurrenceId: string, volunteerId: string) {
  const volunteer = await tx.volunteer.findUnique({ where: { id: volunteerId }, select: { memberId: true, eventId: true } })
  if (!volunteer?.eventId) return null
  return tx.sessionRegistration.findFirst({ where: { occurrenceId, occurrence: { eventId: volunteer.eventId },
    registrant: { eventId: volunteer.eventId, memberId: volunteer.memberId } }, select: { registrantId: true } })
}

/** Move existing serving attendance rather than adding a second presence record. */
export async function convertVolunteerAttendance(tx: Prisma.TransactionClient, occurrenceId: string, registrantId: string) {
  const registrant = await tx.eventRegistrant.findUniqueOrThrow({ where: { id: registrantId }, select: { memberId: true, eventId: true } })
  if (!registrant.memberId) return
  const serving = await tx.occurrenceAttendee.findMany({ where: { occurrenceId,
    volunteer: { memberId: registrant.memberId, eventId: registrant.eventId } }, orderBy: { checkedInAt: "asc" } })
  if (!serving.length) return
  const existing = await tx.occurrenceAttendee.findUnique({ where: { occurrenceId_registrantId: { occurrenceId, registrantId } } })
  const earliest = existing && existing.checkedInAt < serving[0].checkedInAt ? existing.checkedInAt : serving[0].checkedInAt
  await tx.occurrenceAttendee.deleteMany({ where: { id: { in: serving.map((a) => a.id) } } })
  await tx.occurrenceAttendee.upsert({ where: { occurrenceId_registrantId: { occurrenceId, registrantId } },
    create: { occurrenceId, registrantId, checkedInAt: earliest }, update: { checkedInAt: earliest } })
}

export async function recordSessionAttendance(occurrenceId: string, subject: { kind: "registrant" | "volunteer"; id: string }, checkedInAt?: Date) {
  const { withSerializableRetry } = await import("@/lib/db/serializable-retry")
  await withSerializableRetry(async (tx) => {
    const occurrence = await tx.eventOccurrence.findUniqueOrThrow({ where: { id: occurrenceId }, select: { eventId: true } })
    const override = subject.kind === "volunteer" ? await sessionParticipantForVolunteer(tx, occurrenceId, subject.id) : null
    const resolved = override ? { kind: "registrant" as const, id: override.registrantId } : subject
    if (resolved.kind === "registrant") {
      const registrant = await tx.eventRegistrant.findFirst({ where: { id: resolved.id, eventId: occurrence.eventId }, select: { id: true } })
      if (!registrant) throw new Error("Invalid attendance subject")
      const sessionRegistration = await tx.sessionRegistration.findUnique({ where: { occurrenceId_registrantId: { occurrenceId, registrantId: resolved.id } } })
      if (sessionRegistration) await convertVolunteerAttendance(tx, occurrenceId, resolved.id)
      await tx.occurrenceAttendee.upsert({ where: { occurrenceId_registrantId: { occurrenceId, registrantId: resolved.id } }, create: { occurrenceId, registrantId: resolved.id, checkedInAt }, update: {} })
    } else {
      const volunteer = await tx.volunteer.findFirst({ where: { id: resolved.id, eventId: occurrence.eventId }, select: { id: true } })
      if (!volunteer) throw new Error("Invalid attendance subject")
      await tx.occurrenceAttendee.upsert({ where: { occurrenceId_volunteerId: { occurrenceId, volunteerId: resolved.id } }, create: { occurrenceId, volunteerId: resolved.id, checkedInAt }, update: {} })
    }
  })
}

export async function hasSessionParticipantRegistration(eventId: string, memberId: string, occurrenceId: string | null | undefined) {
  if (!occurrenceId) return false
  return !!await db.sessionRegistration.findFirst({ where: { occurrenceId, occurrence: { eventId }, registrant: { eventId, memberId } }, select: { id: true } })
}
