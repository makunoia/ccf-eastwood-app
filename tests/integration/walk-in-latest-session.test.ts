import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  setWalkInLatestSession,
  setWalkInOccurrence,
} from "@/app/(dashboard)/events/form-config-actions"
import { setOccurrenceCheckinOpen } from "@/app/(dashboard)/events/actions"
import { setFormOpen } from "@/app/(dashboard)/forms/actions"
import { getFormConfig } from "@/lib/forms/config"
import { resolveWalkInAccess } from "@/lib/events/walk-in-access"
import { latestWalkInSession, resolveWalkInSession } from "@/lib/events/walk-in-session"
import { checkInWalkInRegistrant } from "@/lib/events/registration-core"

/**
 * "Follow the latest session" mode for the walk-in door.
 *
 * A pinned session (CCF-133) is correct for one night. A Recurring event grows a
 * session every time check-in is opened, so next week the pin is stale and the
 * door reads "no session is open for walk-in" while check-in plainly is open —
 * the re-point is the step that gets forgotten. Latest mode makes "the newest
 * session" the standing answer.
 *
 * What these pin: the resolution rule, that it keeps following newly created
 * sessions, and that it did not become an exemption from the open/closed gate.
 */

async function seedEvent(
  name: string,
  type: "OneTime" | "MultiDay" | "Recurring" = "Recurring"
) {
  return db.event.create({
    data: {
      name,
      type,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
}

/**
 * `createdAt` is set explicitly rather than left to `now()`: two rows inserted
 * back to back can land on the same millisecond, which would make "newest"
 * ambiguous in the test and hide a real ordering bug behind insertion luck.
 */
async function seedOccurrence(
  eventId: string,
  date: string,
  isOpen: boolean,
  createdAt: string
) {
  return db.eventOccurrence.create({
    data: { eventId, date: new Date(date), isOpen, createdAt: new Date(createdAt) },
  })
}

/** The event shape the public walk-in/check-in surfaces resolve the door from. */
function loadEvent(id: string) {
  return db.event.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      type: true,
      walkInSessionMode: true,
      walkInOccurrenceId: true,
      walkInOccurrence: { select: { id: true, isOpen: true } },
    },
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "FormConfig", "EventFormConfig", "EventOccurrence", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("walk-in session mode", () => {
  it("defaults to a pinned session", async () => {
    // The existing behavior stays the default — following the latest session is
    // opt-in, because a resolved target is exactly what CCF-133 removed.
    const event = await seedEvent("Sunday Service")
    expect(event.walkInSessionMode).toBe("Pinned")
  })

  it("switches to Latest and back by picking a session", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")

    expect((await setWalkInLatestSession(event.id)).success).toBe(true)
    expect((await loadEvent(event.id)).walkInSessionMode).toBe("Latest")

    // Naming a session is what "pinned" means, so the pick has to end Latest mode
    // — otherwise the dropdown would save a value the door then ignores.
    expect((await setWalkInOccurrence(event.id, occurrence.id)).success).toBe(true)
    const after = await loadEvent(event.id)
    expect(after.walkInSessionMode).toBe("Pinned")
    expect(after.walkInOccurrenceId).toBe(occurrence.id)
  })

  it("refuses Latest on a OneTime event", async () => {
    // OneTime events have no occurrences to be latest of; a walk-in there stamps
    // `attendedAt` instead.
    const event = await seedEvent("Christmas Party", "OneTime")
    const result = await setWalkInLatestSession(event.id)
    expect(result.success).toBe(false)
    expect((await loadEvent(event.id)).walkInSessionMode).toBe("Pinned")
  })

  it("errors on an unknown event", async () => {
    const result = await setWalkInLatestSession("does-not-exist")
    expect(result.success).toBe(false)
  })
})

describe("resolving the latest session", () => {
  it("picks the most recently created session, not the latest date", async () => {
    // The two orderings disagree here on purpose: staff back-filled last week's
    // session after opening this week's. "Created" is the rule, because that is
    // what tracks the session the event is currently running.
    const event = await seedEvent("Sunday Service")
    await seedOccurrence(event.id, "2026-08-30", true, "2026-08-01T01:00:00Z")
    const newest = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")

    expect((await latestWalkInSession(event.id))?.id).toBe(newest.id)
  })

  it("breaks a same-timestamp tie on the later date", async () => {
    // MultiDay days are created in one batch and can share a timestamp to the
    // millisecond. Without the tie-break the winner would be whatever order
    // Postgres returned, so the door could drift between requests.
    const event = await seedEvent("Camp", "MultiDay")
    const batch = "2026-08-01T01:00:00Z"
    const day1 = await seedOccurrence(event.id, "2026-08-09", true, batch)
    const day2 = await seedOccurrence(event.id, "2026-08-10", true, batch)

    const latest = await latestWalkInSession(event.id)
    expect(latest?.id).toBe(day2.id)
    expect(latest?.id).not.toBe(day1.id)
  })

  it("only looks at the event's own sessions", async () => {
    const event = await seedEvent("Sunday Service")
    const other = await seedEvent("Youth Night")
    const mine = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    await seedOccurrence(other.id, "2026-08-10", true, "2026-08-10T01:00:00Z")

    expect((await latestWalkInSession(event.id))?.id).toBe(mine.id)
  })

  it("returns null when the event has no sessions yet", async () => {
    const event = await seedEvent("Sunday Service")
    expect(await latestWalkInSession(event.id)).toBeNull()
    await setWalkInLatestSession(event.id)
    expect(await resolveWalkInSession(await loadEvent(event.id))).toBeNull()
  })

  it("ignores the stored pin while in Latest mode", async () => {
    const event = await seedEvent("Sunday Service")
    const oldSession = await seedOccurrence(event.id, "2026-08-02", true, "2026-08-02T01:00:00Z")
    const newest = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")

    await setWalkInOccurrence(event.id, oldSession.id)
    await setWalkInLatestSession(event.id)

    const resolved = await resolveWalkInSession(await loadEvent(event.id))
    expect(resolved?.id).toBe(newest.id)
    // The pin is deliberately left in the column: switching back shouldn't lose
    // which session was named.
    expect((await loadEvent(event.id)).walkInOccurrenceId).toBe(oldSession.id)
  })

  it("follows a session created after the switch — the whole point", async () => {
    const event = await seedEvent("Sunday Service")
    const thisWeek = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    await setWalkInLatestSession(event.id)
    expect((await resolveWalkInSession(await loadEvent(event.id)))?.id).toBe(thisWeek.id)

    // Next Sunday: opening check-in creates the session. Nobody re-points anything.
    const nextWeek = await seedOccurrence(event.id, "2026-08-16", true, "2026-08-16T01:00:00Z")
    expect((await resolveWalkInSession(await loadEvent(event.id)))?.id).toBe(nextWeek.id)
  })

  it("falls back to the previous session when the newest is deleted", async () => {
    const event = await seedEvent("Sunday Service")
    const first = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    const second = await seedOccurrence(event.id, "2026-08-16", true, "2026-08-16T01:00:00Z")
    await setWalkInLatestSession(event.id)

    await db.eventOccurrence.delete({ where: { id: second.id } })

    expect((await resolveWalkInSession(await loadEvent(event.id)))?.id).toBe(first.id)
  })

  it("resolves nothing for a OneTime event, whatever the mode says", async () => {
    // Defence in depth: the action refuses Latest on OneTime, so this only fires
    // if a row is written some other way. A OneTime walk-in stamps `attendedAt`.
    const event = await seedEvent("Christmas Party", "OneTime")
    await db.event.update({
      where: { id: event.id },
      data: { walkInSessionMode: "Latest" },
    })
    expect(await resolveWalkInSession(await loadEvent(event.id))).toBeNull()
  })
})

describe("Latest mode and the open/closed gate", () => {
  async function access(eventId: string) {
    const event = await loadEvent(eventId)
    return resolveWalkInAccess({
      eventType: event.type,
      formIsOpen: (await getFormConfig("EventWalkIn", eventId)).isOpen,
      session: await resolveWalkInSession(event),
    })
  }

  it("opens the door into the newest session when it's open", async () => {
    const event = await seedEvent("Sunday Service")
    await setFormOpen("EventWalkIn", event.id, true)
    await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    const newest = await seedOccurrence(event.id, "2026-08-16", false, "2026-08-16T01:00:00Z")
    await setWalkInLatestSession(event.id)
    await setOccurrenceCheckinOpen(newest.id, true)

    expect(await access(event.id)).toEqual({ open: true, occurrenceId: newest.id })
  })

  it("stays off when the newest session is closed, even with an older one open", async () => {
    // Latest mode changes which session is read, not whether it has to be open —
    // it is not a search for any open session, which is the behavior CCF-133
    // removed.
    const event = await seedEvent("Sunday Service")
    await setFormOpen("EventWalkIn", event.id, true)
    await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    await seedOccurrence(event.id, "2026-08-16", false, "2026-08-16T01:00:00Z")
    await setWalkInLatestSession(event.id)

    expect(await access(event.id)).toEqual({ open: false, reason: "noSession" })
  })

  it("stays off when the form switch is off, however the session resolves", async () => {
    const event = await seedEvent("Sunday Service")
    await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    await setWalkInLatestSession(event.id)

    expect(await access(event.id)).toEqual({ open: false, reason: "formClosed" })
  })
})

describe("opening check-in with Latest mode on", () => {
  it("leaves the pin alone — the target is derived", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", false, "2026-08-09T01:00:00Z")
    await setWalkInLatestSession(event.id)

    await setOccurrenceCheckinOpen(occurrence.id, true)

    const row = await loadEvent(event.id)
    expect(row.walkInOccurrenceId).toBeNull()
    expect(row.walkInSessionMode).toBe("Latest")
  })

  it("reports the door moved when the opened session is the newest one", async () => {
    const event = await seedEvent("Sunday Service")
    await seedOccurrence(event.id, "2026-08-09", false, "2026-08-09T01:00:00Z")
    const newest = await seedOccurrence(event.id, "2026-08-16", false, "2026-08-16T01:00:00Z")
    await setWalkInLatestSession(event.id)

    const result = await setOccurrenceCheckinOpen(newest.id, true)
    expect(result).toEqual({ success: true, data: { walkInChanged: true } })
  })

  it("reports no change when the opened session isn't the newest", async () => {
    // The toast says "walk-in now registers into this session". In Latest mode
    // opening an older session doesn't move the door, so it must stay silent.
    const event = await seedEvent("Sunday Service")
    const older = await seedOccurrence(event.id, "2026-08-09", false, "2026-08-09T01:00:00Z")
    await seedOccurrence(event.id, "2026-08-16", false, "2026-08-16T01:00:00Z")
    await setWalkInLatestSession(event.id)

    const result = await setOccurrenceCheckinOpen(older.id, true)
    expect(result).toEqual({ success: true, data: { walkInChanged: false } })
  })

  it("still repoints the pin when the event is in Pinned mode", async () => {
    // Regression guard on the branch added for Latest mode: the default path must
    // keep naming the session whose check-in was opened.
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", false, "2026-08-09T01:00:00Z")

    await setOccurrenceCheckinOpen(occurrence.id, true)

    expect((await loadEvent(event.id)).walkInOccurrenceId).toBe(occurrence.id)
  })
})

/**
 * The other half of "the door decides which session": what the *submit* accepts.
 *
 * Resolving the session server-side only holds if the id that comes back in the
 * payload is checked against the same event. The walk-in route is public, so the
 * flag and the session id are both self-asserted by the request.
 */
describe("checkInWalkInRegistrant", () => {
  async function seedRegistrant(eventId: string) {
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Cruz", dateJoined: new Date(), language: [] },
    })
    return db.eventRegistrant.create({ data: { eventId, memberId: member.id } })
  }

  it("records attendance at a session of the registrant's own event", async () => {
    const event = await seedEvent("Sunday Service")
    const occurrence = await seedOccurrence(event.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    const registrant = await seedRegistrant(event.id)

    await checkInWalkInRegistrant(registrant.id, occurrence.id)

    expect(
      await db.occurrenceAttendee.count({
        where: { occurrenceId: occurrence.id, registrantId: registrant.id },
      })
    ).toBe(1)
  })

  it("ignores a session belonging to a different event", async () => {
    // A hand-edited POST naming another event's session would otherwise add an
    // attendee row there, inflating every figure that counts occurrence
    // attendance for an event this person never registered for.
    const mine = await seedEvent("Sunday Service")
    const theirs = await seedEvent("Youth Night")
    const foreign = await seedOccurrence(theirs.id, "2026-08-09", true, "2026-08-09T01:00:00Z")
    const registrant = await seedRegistrant(mine.id)

    await checkInWalkInRegistrant(registrant.id, foreign.id)

    expect(await db.occurrenceAttendee.count()).toBe(0)
  })

  it("still stamps attendedAt when there is no session at all", async () => {
    // OneTime events have no occurrences — the null branch must survive the scope
    // check being added above it.
    const event = await seedEvent("Retreat", "OneTime")
    const registrant = await seedRegistrant(event.id)

    await checkInWalkInRegistrant(registrant.id, null)

    expect(
      (await db.eventRegistrant.findUniqueOrThrow({ where: { id: registrant.id } })).attendedAt
    ).not.toBeNull()
  })
})
