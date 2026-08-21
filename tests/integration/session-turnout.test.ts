import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { loadSessionTurnout } from "@/lib/events/session-turnout"
import { buildTurnout } from "@/lib/events/turnout"

/**
 * The two figures behind a session's turnout ratio, read off real rows.
 *
 * The whole risk lives in the numerator. An `OccurrenceAttendee` carries either a
 * `registrantId` or a `volunteerId`, and only the first has an `EventRegistrant`
 * to be counted against — so a numerator that takes the relation whole compares
 * against a denominator its own people are missing from, and a well-staffed
 * session reports a rate above 100%. These tests seed both kinds of check-in row
 * deliberately and pin that only registrants are counted.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name = "Sunday Service") {
  return db.event.create({
    data: {
      name,
      type: "Recurring",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    },
  })
}

async function seedOccurrence(eventId: string, date: string) {
  return db.eventOccurrence.create({
    data: { eventId, date: new Date(`${date}T00:00:00.000Z`) },
  })
}

/** A registrant of the series, optionally checked in to a session. */
async function seedRegistrant(eventId: string, occurrenceId?: string) {
  const registrant = await db.eventRegistrant.create({
    data: { eventId, firstName: "Reg", lastName: crypto.randomUUID().slice(0, 8) },
  })
  if (occurrenceId) {
    await db.occurrenceAttendee.create({
      data: { occurrenceId, registrantId: registrant.id, checkedInAt: new Date() },
    })
  }
  return registrant
}

/** A volunteer needs a committee and a preferred role before it can exist. */
async function seedCommitteeRole(eventId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushering", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Usher", committeeId: committee.id },
  })
  return { committeeId: committee.id, preferredRoleId: role.id }
}

/** A volunteer check-in — a person serving, holding no registration. */
async function seedVolunteerCheckIn(
  eventId: string,
  occurrenceId: string,
  role: { committeeId: string; preferredRoleId: string },
) {
  const member = await db.member.create({
    data: {
      firstName: "Vol",
      lastName: crypto.randomUUID().slice(0, 8),
      dateJoined: new Date(),
      language: [],
    },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, ...role },
  })
  await db.occurrenceAttendee.create({
    data: { occurrenceId, volunteerId: volunteer.id, checkedInAt: new Date() },
  })
  return volunteer
}

describe("loadSessionTurnout", () => {
  it("counts the whole series roster as the denominator", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-08-09")
    await seedRegistrant(event.id, occurrence.id)
    await seedRegistrant(event.id)
    await seedRegistrant(event.id)

    const { totalRegistrants } = await loadSessionTurnout(db, event.id)

    // Registration is per series, so a registrant who skipped this session is
    // still in the denominator — that is what makes the figure a turnout.
    expect(totalRegistrants).toBe(3)
  })

  // Regression: the numerator must not take the attendee relation whole.
  it("excludes volunteer check-ins from the per-occurrence numerator", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-08-09")
    const role = await seedCommitteeRole(event.id)
    await seedRegistrant(event.id, occurrence.id)
    await seedRegistrant(event.id, occurrence.id)
    await seedVolunteerCheckIn(event.id, occurrence.id, role)
    await seedVolunteerCheckIn(event.id, occurrence.id, role)

    const { participantsByOccurrence } = await loadSessionTurnout(db, event.id)

    expect(participantsByOccurrence.get(occurrence.id)).toBe(2)
    // Four check-in rows exist; only half of them are registrants.
    const rows = await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id } })
    expect(rows).toBe(4)
  })

  it("never yields a rate above 100% on a volunteer-heavy session", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-08-09")
    const role = await seedCommitteeRole(event.id)
    await seedRegistrant(event.id, occurrence.id)
    for (let i = 0; i < 5; i++) await seedVolunteerCheckIn(event.id, occurrence.id, role)

    const { totalRegistrants, participantsByOccurrence } = await loadSessionTurnout(db, event.id)
    const turnout = buildTurnout(totalRegistrants, participantsByOccurrence.get(occurrence.id) ?? 0)

    expect(turnout.rate).toBe(1)
    expect(turnout.noShows).toBe(0)
  })

  it("keeps each session's numerator to its own occurrence", async () => {
    const event = await seedEvent()
    const first = await seedOccurrence(event.id, "2026-08-09")
    const second = await seedOccurrence(event.id, "2026-08-16")

    const a = await seedRegistrant(event.id, first.id)
    await seedRegistrant(event.id, first.id)
    await seedRegistrant(event.id, second.id)
    // A regular attends both — one registrant row, two check-ins.
    await db.occurrenceAttendee.create({
      data: { occurrenceId: second.id, registrantId: a.id, checkedInAt: new Date() },
    })

    const { totalRegistrants, participantsByOccurrence } = await loadSessionTurnout(db, event.id)

    expect(totalRegistrants).toBe(3)
    expect(participantsByOccurrence.get(first.id)).toBe(2)
    expect(participantsByOccurrence.get(second.id)).toBe(2)
  })

  it("leaves a session nobody attended out of the map", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-08-23")
    await seedRegistrant(event.id)

    const { participantsByOccurrence } = await loadSessionTurnout(db, event.id)

    // The surfaces read this with `?? 0`; an upcoming session simply has no row.
    expect(participantsByOccurrence.get(occurrence.id)).toBeUndefined()
  })

  it("does not count another event's registrants or check-ins", async () => {
    const event = await seedEvent()
    const other = await seedEvent("Youth Night")
    const occurrence = await seedOccurrence(event.id, "2026-08-09")
    const otherOccurrence = await seedOccurrence(other.id, "2026-08-09")

    await seedRegistrant(event.id, occurrence.id)
    await seedRegistrant(other.id, otherOccurrence.id)
    await seedRegistrant(other.id)

    const { totalRegistrants, participantsByOccurrence } = await loadSessionTurnout(db, event.id)

    expect(totalRegistrants).toBe(1)
    expect(participantsByOccurrence.get(otherOccurrence.id)).toBeUndefined()
  })

  it("has no rate for an event nobody registered for", async () => {
    const event = await seedEvent()
    await seedOccurrence(event.id, "2026-08-09")

    const { totalRegistrants } = await loadSessionTurnout(db, event.id)

    expect(totalRegistrants).toBe(0)
    expect(buildTurnout(totalRegistrants, 0).rate).toBeNull()
  })
})
