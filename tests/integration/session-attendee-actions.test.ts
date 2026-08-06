/**
 * Session detail page attendance row actions:
 *  - `setAttendeeReturnerStatus` — pins / clears the New↔Returning badge
 *  - `removeSessionAttendee` — takes one person off a session's checked-in list
 *
 * Both are event-scoped writes, so permission enforcement is covered here too.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { isEstablishedAttendee, resolveAttendeeStatus } from "@/lib/session-stats"
import { resolveStatusSelection } from "@/lib/session-attendees"
import {
  removeSessionAttendee,
  setAttendeeReturnerStatus,
} from "@/app/(event)/event/[id]/sessions/[occurrenceId]/attendee-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "OccurrenceSubFacilitator", "EventOccurrence", "EventRegistrant", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Midweek",
      type: "Recurring",
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  })
}

async function seedOccurrence(eventId: string, date: string) {
  return db.eventOccurrence.create({
    data: { eventId, date: new Date(`${date}T00:00:00Z`) },
  })
}

async function seedGuestAttendee(eventId: string, occurrenceId: string) {
  const guest = await db.guest.create({
    data: { firstName: "Jem", lastName: "Reyes", language: [] },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, guestId: guest.id },
  })
  const attendee = await db.occurrenceAttendee.create({
    data: { occurrenceId, registrantId: registrant.id },
  })
  return { guest, registrant, attendee }
}

async function seedVolunteerAttendee(eventId: string, occurrenceId: string) {
  const member = await db.member.create({
    data: { firstName: "Rex", lastName: "Santos", dateJoined: new Date(), language: [] },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushering", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Usher", committeeId: committee.id },
  })
  const volunteer = await db.volunteer.create({
    data: {
      memberId: member.id,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })
  const attendee = await db.occurrenceAttendee.create({
    data: { occurrenceId, volunteerId: volunteer.id },
  })
  return { member, volunteer, attendee }
}

function asStaff(overrides: Record<string, unknown> = {}) {
  vi.mocked(auth).mockResolvedValueOnce({
    user: {
      id: "staff",
      name: "Staff",
      email: "staff@example.com",
      username: "staff",
      role: "Staff",
      permissions: [],
      eventAccess: [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
      ...overrides,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

// ─── setAttendeeReturnerStatus ────────────────────────────────────────────────

describe("setAttendeeReturnerStatus", () => {
  it("pins a first-time guest to Returning", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    const result = await setAttendeeReturnerStatus(attendee.id, true)

    expect(result.success).toBe(true)
    const updated = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(updated?.isReturnerOverride).toBe(true)
  })

  it("clears the override back to the derived value when passed null", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    await setAttendeeReturnerStatus(attendee.id, true)
    const result = await setAttendeeReturnerStatus(attendee.id, null)

    expect(result.success).toBe(true)
    const updated = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(updated?.isReturnerOverride).toBeNull()
  })

  it("can also pin a row to New", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    const result = await setAttendeeReturnerStatus(attendee.id, false)

    expect(result.success).toBe(true)
    const updated = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(updated?.isReturnerOverride).toBe(false)
  })

  // Regression for the misclick the status menu exists to undo: an admin marks a first-timer
  // Returning by accident and picks New again. Driving it through `resolveStatusSelection` —
  // the same mapping the menu uses — proves the correction leaves *no* override behind, so
  // the row goes back to tracking the person's real attendance history.
  it("returns a mis-set guest to New with no override left behind", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { registrant, attendee } = await seedGuestAttendee(event.id, occurrence.id)

    const derivedIsReturner = isEstablishedAttendee(false, [], occurrence.id, occurrence.date)
    expect(derivedIsReturner).toBe(false)

    const misclick = resolveStatusSelection("returning", derivedIsReturner)
    await setAttendeeReturnerStatus(attendee.id, misclick.override)
    expect(
      (await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } }))
        ?.isReturnerOverride,
    ).toBe(true)

    const correction = resolveStatusSelection("new", derivedIsReturner)
    expect(correction.override).toBeNull()
    const result = await setAttendeeReturnerStatus(attendee.id, correction.override)

    expect(result.success).toBe(true)
    const row = await db.occurrenceAttendee.findUnique({
      where: { id: attendee.id },
      select: { isReturnerOverride: true },
    })
    expect(row?.isReturnerOverride).toBeNull()

    // …and the badge the page would render is New again.
    const attendances = await db.occurrenceAttendee.findMany({
      where: { registrantId: registrant.id },
      select: { occurrenceId: true, occurrence: { select: { date: true } } },
    })
    expect(
      resolveAttendeeStatus(
        row?.isReturnerOverride,
        false,
        attendances,
        occurrence.id,
        occurrence.date,
      ),
    ).toBe(false)
  })

  it("rejects a volunteer attendance row — volunteers have no New/Returning status", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedVolunteerAttendee(event.id, occurrence.id)

    const result = await setAttendeeReturnerStatus(attendee.id, true)

    expect(result.success).toBe(false)
    const untouched = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(untouched?.isReturnerOverride).toBeNull()
  })

  it("returns a friendly error for an unknown attendance row", async () => {
    const result = await setAttendeeReturnerStatus("does-not-exist", true)
    expect(result).toEqual({ success: false, error: "Attendance record not found." })
  })

  it("rejects a non tri-state value — server actions take unvalidated input", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await setAttendeeReturnerStatus(attendee.id, "yes" as any)

    expect(result).toEqual({ success: false, error: "Invalid status." })
    const untouched = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(untouched?.isReturnerOverride).toBeNull()
  })

  // Regression: promoting a guest to a Member repoints their EventRegistrant, but the
  // override lives on the attendance row and survives. The row must stay clearable —
  // `isAttendeeStatusEditable` keeps the badge clickable, and this action must accept it.
  it("still accepts a clear after the guest behind the row was promoted to a Member", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { guest, registrant, attendee } = await seedGuestAttendee(event.id, occurrence.id)

    await setAttendeeReturnerStatus(attendee.id, false)

    // Promote — mirrors app/(dashboard)/guests/actions.ts.
    const member = await db.member.create({
      data: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        dateJoined: new Date(),
        language: [],
      },
    })
    await db.eventRegistrant.update({
      where: { id: registrant.id },
      data: { memberId: member.id, guestId: null },
    })

    const pinned = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(pinned?.isReturnerOverride).toBe(false)

    const result = await setAttendeeReturnerStatus(attendee.id, null)

    expect(result.success).toBe(true)
    const cleared = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(cleared?.isReturnerOverride).toBeNull()
  })

  it("rejects a staff user without Events write access", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    asStaff({ permissions: [{ feature: "Events", actions: ["Read"] }] })
    const result = await setAttendeeReturnerStatus(attendee.id, true)

    expect(result).toEqual({ success: false, error: "Unauthorized." })
    const untouched = await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })
    expect(untouched?.isReturnerOverride).toBeNull()
  })

  it("rejects a staff user scoped to a different event", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    asStaff({
      permissions: [{ feature: "Events", actions: ["Read", "Write"] }],
      eventAccess: ["some-other-event"],
    })
    const result = await setAttendeeReturnerStatus(attendee.id, true)

    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })
})

// ─── removeSessionAttendee ────────────────────────────────────────────────────

describe("removeSessionAttendee", () => {
  it("removes the person from this session only", async () => {
    const event = await seedEvent()
    const first = await seedOccurrence(event.id, "2026-05-28")
    const second = await seedOccurrence(event.id, "2026-06-04")
    const { registrant } = await seedGuestAttendee(event.id, first.id)
    const secondAttendance = await db.occurrenceAttendee.create({
      data: { occurrenceId: second.id, registrantId: registrant.id },
    })

    const result = await removeSessionAttendee(secondAttendance.id)

    expect(result.success).toBe(true)
    expect(
      await db.occurrenceAttendee.findUnique({ where: { id: secondAttendance.id } }),
    ).toBeNull()
    // The earlier session's attendance survives…
    expect(await db.occurrenceAttendee.count({ where: { occurrenceId: first.id } })).toBe(1)
    // …and so does the registration itself.
    expect(
      await db.eventRegistrant.findUnique({ where: { id: registrant.id } }),
    ).not.toBeNull()
  })

  it("removes a volunteer check-in without touching the Volunteer record", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { volunteer, attendee } = await seedVolunteerAttendee(event.id, occurrence.id)

    const result = await removeSessionAttendee(attendee.id)

    expect(result.success).toBe(true)
    expect(await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } })).toBeNull()
    expect(await db.volunteer.findUnique({ where: { id: volunteer.id } })).not.toBeNull()
  })

  it("returns a friendly error for an unknown attendance row", async () => {
    const result = await removeSessionAttendee("does-not-exist")
    expect(result).toEqual({ success: false, error: "Attendance record not found." })
  })

  it("rejects a staff user without Events write access", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { attendee } = await seedGuestAttendee(event.id, occurrence.id)

    asStaff({ permissions: [{ feature: "Events", actions: ["Read", "Export"] }] })
    const result = await removeSessionAttendee(attendee.id)

    expect(result).toEqual({ success: false, error: "Unauthorized." })
    expect(
      await db.occurrenceAttendee.findUnique({ where: { id: attendee.id } }),
    ).not.toBeNull()
  })

  it("frees the person to be checked in again afterwards", async () => {
    const event = await seedEvent()
    const occurrence = await seedOccurrence(event.id, "2026-06-04")
    const { registrant, attendee } = await seedGuestAttendee(event.id, occurrence.id)

    await removeSessionAttendee(attendee.id)

    // The @@unique([occurrenceId, registrantId]) slot is free again.
    const recheck = await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, registrantId: registrant.id },
    })
    expect(recheck.id).not.toBe(attendee.id)
  })
})
