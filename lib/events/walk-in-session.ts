import { db } from "@/lib/db"
import type { EventType, WalkInSessionMode } from "@/app/generated/prisma/client"

/**
 * Which session an event's walk-in door is aimed at right now.
 *
 * Two modes, and the difference is only *where the id comes from*:
 *
 *  - `Pinned` — `Event.walkInOccurrenceId`, one session an admin named (or that
 *    opening a session's check-in named for them). The CCF-133 default.
 *  - `Latest` — the event's most recently created session, resolved per request.
 *
 * `Latest` exists because a Recurring event grows a session every time check-in
 * is opened, so a pin has to be re-aimed every week and that is the step that
 * gets forgotten — the door then reads "no session is open for walk-in" on a
 * night when check-in plainly is. It is opt-in, and it is the *only* resolved
 * (rather than named) target in the system: everything else about CCF-133 exists
 * to stop a walk-in landing in a session nobody chose, so the choice here is
 * "whichever session is newest", made once, explicitly.
 *
 * What it does not do is bypass the open/closed gate. `resolveWalkInAccess` still
 * requires the resolved session to be open, so a Latest-mode door is off until
 * that session's check-in is opened, exactly like a pinned one.
 */

/** The shape every walk-in surface needs: an id to register into, and the gate. */
export type WalkInSessionRef = { id: string; isOpen: boolean }

/**
 * The event fields required to resolve the door. Named as a type so a surface
 * that forgets to select `walkInSessionMode` fails the build instead of silently
 * falling back to the pin.
 */
export type WalkInSessionEvent = {
  id: string
  type: EventType
  walkInSessionMode: WalkInSessionMode
  walkInOccurrence: WalkInSessionRef | null
}

/**
 * "Latest created" ordering, in one place.
 *
 * `date` breaks ties because MultiDay days are all created in one batch and can
 * share a timestamp to the millisecond; without it the winner would be whatever
 * order Postgres felt like returning, and the door would drift between requests.
 */
const LATEST_FIRST = [{ createdAt: "desc" }, { date: "desc" }] as const

/** The event's most recently created session, whatever its open state. */
export async function latestWalkInSession(eventId: string): Promise<
  (WalkInSessionRef & { date: Date }) | null
> {
  return db.eventOccurrence.findFirst({
    where: { eventId },
    orderBy: [...LATEST_FIRST],
    select: { id: true, isOpen: true, date: true },
  })
}

/**
 * Resolve an event's walk-in session for the surfaces that gate on it.
 *
 * OneTime events never have one — a walk-in there stamps `attendedAt` — so this
 * returns null for them without a query, and `resolveWalkInAccess` ignores the
 * value entirely for that type.
 */
export async function resolveWalkInSession(
  event: WalkInSessionEvent
): Promise<WalkInSessionRef | null> {
  if (event.type === "OneTime") return null
  if (event.walkInSessionMode === "Pinned") return event.walkInOccurrence
  const latest = await latestWalkInSession(event.id)
  return latest ? { id: latest.id, isOpen: latest.isOpen } : null
}
