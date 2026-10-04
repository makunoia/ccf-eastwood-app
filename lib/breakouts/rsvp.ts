import "server-only"
import { db } from "@/lib/db"
import { resolveActiveSession } from "@/lib/events/walk-in-session"
import { personKeyFor } from "@/lib/clusters/roster"
import type { BreakoutOwner } from "@/lib/breakouts/owner"

/** Person identity, not the seated registrant row, joins a shared table to its RSVPs. */
export async function breakoutRsvpKeys(owner: BreakoutOwner, occurrenceId?: string): Promise<Set<string>> {
  let occurrenceIds: string[]
  if ("clusterId" in owner) {
    const links = await db.eventClusterEvent.findMany({ where: { clusterId: owner.clusterId }, select: { occurrenceId: true } })
    occurrenceIds = links.flatMap((link) => link.occurrenceId ? [link.occurrenceId] : [])
  } else {
    const event = await db.event.findUnique({ where: { id: owner.eventId }, select: { id: true, type: true, walkInSessionMode: true, walkInOccurrence: { select: { id: true, isOpen: true } } } })
    const session = occurrenceId
      ? await db.eventOccurrence.findFirst({ where: { id: occurrenceId, eventId: owner.eventId }, select: { id: true } })
      : event ? await resolveActiveSession(event) : null
    occurrenceIds = session ? [session.id] : []
  }
  if (!occurrenceIds.length) return new Set()
  const rsvps = await db.sessionRsvp.findMany({ where: { occurrenceId: { in: occurrenceIds } }, select: { registrant: { select: { id: true, memberId: true, guestId: true } } } })
  return new Set(rsvps.map((rsvp) => personKeyFor(rsvp.registrant)))
}
