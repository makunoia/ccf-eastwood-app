import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  checkInToCluster,
  lookupClusterCheckin,
  searchClusterCheckinByName,
} from "@/app/(dashboard)/events/cluster-actions"
import { getClusterRegistrantRows } from "@/lib/clusters/aggregate"
import { buildClusterRoster } from "@/lib/clusters/roster"

/**
 * The cluster day's check-in kiosk.
 *
 * A cluster is one day made of independent events. Until now a person who
 * pre-registered for three of them had to be found three times, on three
 * separate per-event kiosks. This finds them once and records the whole day.
 *
 *  - integration: lookup across the day, one tap writing OneTime `attendedAt`
 *                 AND the linked session's OccurrenceAttendee, the admin board
 *                 agreeing afterwards
 *  - regression:  the kiosk never bypasses an event that closed its own
 *                 check-in, and never creates a registration
 *  - security:    a person key is re-resolved from the cluster's own events, so
 *                 a registrant of an outside event cannot be stamped
 *  - edge case:   idempotent re-tap, closed kiosk, unlinked recurring event,
 *                 ambiguous same-contact candidates, volunteers, a day with no
 *                 events
 *  - unit:        the collapse itself in tests/unit/cluster-checkin-person
 *  - e2e:         skipped — the existing check-in spec is a 404 smoke test with
 *                 no cluster fixtures; adding Playwright cluster seeding is a
 *                 change of its own
 */

const DAY = new Date("2026-08-02T00:00:00Z")
const OTHER_DAY = new Date("2026-07-26T00:00:00Z")
const PHONE = "+63 917 123 4567"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "Volunteer", "CommitteeRole",
    "VolunteerCommittee", "EventRegistrant", "FormConfig", "EventFormConfig",
    "EventClusterEvent", "EventCluster", "Event", "Guest", "Member"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedCluster(overrides: { date?: Date | null; checkInIsOpen?: boolean } = {}) {
  return db.eventCluster.create({
    data: {
      name: "Sunday, Aug 2",
      date: overrides.date === undefined ? DAY : overrides.date,
      isOpen: true,
      checkInIsOpen: overrides.checkInIsOpen ?? true,
    },
  })
}

async function seedOneTime(name: string, date = DAY) {
  return db.event.create({
    data: { name, type: "OneTime", startDate: date, endDate: date },
  })
}

async function seedRecurring(name = "Sunday Service") {
  return db.event.create({
    data: {
      name,
      type: "Recurring",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  })
}

/** Sessions are seeded open so reachability doesn't depend on the wall clock. */
async function seedSession(eventId: string, date: Date, isOpen = true) {
  return db.eventOccurrence.create({ data: { eventId, date, isOpen } })
}

async function link(
  clusterId: string,
  eventId: string,
  occurrenceId: string | null = null,
  order = 0
) {
  return db.eventClusterEvent.create({
    data: { clusterId, eventId, occurrenceId, order },
  })
}

async function seedMember(firstName = "Juan", phone: string | null = PHONE) {
  return db.member.create({
    data: {
      firstName,
      lastName: "Dela Cruz",
      phone,
      dateJoined: new Date(),
      language: [],
    },
  })
}

async function seedGuest(firstName = "Ana", phone: string | null = PHONE) {
  return db.guest.create({
    data: { firstName, lastName: "Bautista", phone, language: [] },
  })
}

async function register(eventId: string, who: { memberId?: string; guestId?: string }) {
  return db.eventRegistrant.create({ data: { eventId, ...who } })
}

async function seedVolunteer(eventId: string, memberId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushers", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Greeter", committeeId: committee.id },
  })
  return db.volunteer.create({
    data: {
      memberId,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
}

/** Close an event's own public check-in form. A missing row means open. */
async function closeEventCheckin(eventId: string) {
  await db.formConfig.create({
    data: { scopeKey: `${eventId}:EventCheckIn`, key: "EventCheckIn", eventId, isOpen: false },
  })
}

/** The common shape: a OneTime event plus a Recurring one linked to today's session. */
async function seedDay() {
  const cluster = await seedCluster()
  const oneTime = await seedOneTime("Youth Night")
  const recurring = await seedRecurring()
  const session = await seedSession(recurring.id, DAY)
  const stale = await seedSession(recurring.id, OTHER_DAY)
  await link(cluster.id, oneTime.id, null, 0)
  await link(cluster.id, recurring.id, session.id, 1)
  return { cluster, oneTime, recurring, session, stale }
}

describe("finding a person across the day", () => {
  it("returns one person carrying a cell per cluster event", async () => {
    const { cluster, oneTime, recurring } = await seedDay()
    const member = await seedMember()
    await register(oneTime.id, { memberId: member.id })
    await register(recurring.id, { memberId: member.id })

    const result = await lookupClusterCheckin(cluster.publicToken, PHONE)

    expect(result.success).toBe(true)
    if (!result.success || result.data?.matchType !== "one") throw new Error("expected one match")
    const person = result.data.person
    expect(person.name).toBe("Juan Dela Cruz")
    expect(person.events).toHaveLength(2)
    expect(person.events.every((c) => c.subject !== null)).toBe(true)
  })

  it("shows an event the person didn't register for as an empty cell", async () => {
    const { cluster, oneTime } = await seedDay()
    const member = await seedMember()
    await register(oneTime.id, { memberId: member.id })

    const result = await lookupClusterCheckin(cluster.publicToken, PHONE)
    if (!result.success || result.data?.matchType !== "one") throw new Error("expected one match")

    const cells = result.data.person.events
    expect(cells.filter((c) => c.subject !== null)).toHaveLength(1)
    expect(cells.filter((c) => c.subject === null)).toHaveLength(1)
  })

  it("finds the same person by name", async () => {
    const { cluster, oneTime, recurring } = await seedDay()
    const member = await seedMember()
    await register(oneTime.id, { memberId: member.id })
    await register(recurring.id, { memberId: member.id })

    const result = await searchClusterCheckinByName(cluster.publicToken, "juan dela")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].events).toHaveLength(2)
  })

  it("returns null when nobody matches", async () => {
    const { cluster } = await seedDay()
    const result = await lookupClusterCheckin(cluster.publicToken, "+63 999 999 9999")
    expect(result).toEqual({ success: true, data: null })
  })

  it("reports ambiguity when two people share a contact", async () => {
    const { cluster, oneTime } = await seedDay()
    const one = await seedMember("Juan")
    const two = await seedGuest("Ana")
    await register(oneTime.id, { memberId: one.id })
    await register(oneTime.id, { guestId: two.id })

    const result = await lookupClusterCheckin(cluster.publicToken, PHONE)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data?.matchType).toBe("ambiguous")
    if (result.data?.matchType !== "ambiguous") return
    expect(result.data.candidates).toHaveLength(2)
  })
})

describe("recording the day in one tap", () => {
  it("stamps attendedAt on the OneTime event and the linked session on the recurring one", async () => {
    const { cluster, oneTime, recurring, session, stale } = await seedDay()
    const member = await seedMember()
    const oneTimeReg = await register(oneTime.id, { memberId: member.id })
    const recurringReg = await register(recurring.id, { memberId: member.id })

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recorded).toHaveLength(2)

    const stamped = await db.eventRegistrant.findUnique({ where: { id: oneTimeReg.id } })
    expect(stamped?.attendedAt).not.toBeNull()

    const attendance = await db.occurrenceAttendee.findMany({
      where: { registrantId: recurringReg.id },
      select: { occurrenceId: true },
    })
    expect(attendance).toHaveLength(1)
    expect(attendance[0].occurrenceId).toBe(session.id)
    // Emphatically not the series' other session.
    expect(attendance[0].occurrenceId).not.toBe(stale.id)
  })

  it("moves the admin board's checked-in figure", async () => {
    const { cluster, oneTime, recurring, session } = await seedDay()
    const member = await seedMember()
    await register(oneTime.id, { memberId: member.id })
    await register(recurring.id, { memberId: member.id })

    await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    const events = [
      { id: oneTime.id, linkedOccurrenceId: null },
      { id: recurring.id, linkedOccurrenceId: session.id },
    ]
    const rows = await getClusterRegistrantRows(events, { clusterId: cluster.id, date: DAY })
    const roster = buildClusterRoster(
      [
        { id: oneTime.id, name: oneTime.name, type: "OneTime" as const },
        { id: recurring.id, name: recurring.name, type: "Recurring" as const },
      ],
      rows
    )

    expect(roster.rows).toHaveLength(1)
    expect(Object.values(roster.rows[0].perEvent).every((c) => c?.checkedIn)).toBe(true)
  })

  it("checks a volunteer in as a volunteer, not a registrant", async () => {
    const { cluster, oneTime } = await seedDay()
    const member = await seedMember()
    const volunteer = await seedVolunteer(oneTime.id, member.id)

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(true)
    const stamped = await db.volunteer.findUnique({ where: { id: volunteer.id } })
    expect(stamped?.attendedAt).not.toBeNull()
  })

  it("is idempotent — a second tap changes nothing", async () => {
    const { cluster, oneTime, recurring } = await seedDay()
    const member = await seedMember()
    const oneTimeReg = await register(oneTime.id, { memberId: member.id })
    const recurringReg = await register(recurring.id, { memberId: member.id })

    await checkInToCluster(cluster.publicToken, `member:${member.id}`)
    const first = await db.eventRegistrant.findUnique({ where: { id: oneTimeReg.id } })

    const second = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(second.success).toBe(true)
    if (!second.success) return
    // Nothing left to record, and both cells report why.
    expect(second.data.recorded).toEqual([])
    expect(second.data.skipped.map((s) => s.reason)).toEqual(["already", "already"])

    const after = await db.eventRegistrant.findUnique({ where: { id: oneTimeReg.id } })
    expect(after?.attendedAt?.toISOString()).toBe(first?.attendedAt?.toISOString())
    const attendance = await db.occurrenceAttendee.count({
      where: { registrantId: recurringReg.id },
    })
    expect(attendance).toBe(1)
  })

  it("never creates a registration for an event the person skipped", async () => {
    const { cluster, oneTime, recurring } = await seedDay()
    const member = await seedMember()
    await register(oneTime.id, { memberId: member.id })

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.skipped).toEqual([
      { eventId: recurring.id, eventName: recurring.name, reason: "notRegistered" },
    ])
    expect(await db.eventRegistrant.count({ where: { eventId: recurring.id } })).toBe(0)
  })
})

describe("what the kiosk refuses to do", () => {
  it("skips an event that closed its own check-in form", async () => {
    // The day's kiosk must not become a bypass for a door someone shut on purpose.
    const { cluster, oneTime, recurring } = await seedDay()
    await closeEventCheckin(oneTime.id)
    const member = await seedMember()
    const oneTimeReg = await register(oneTime.id, { memberId: member.id })
    await register(recurring.id, { memberId: member.id })

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recorded.map((r) => r.eventId)).toEqual([recurring.id])
    expect(result.data.skipped).toEqual([
      { eventId: oneTime.id, eventName: oneTime.name, reason: "formClosed" },
    ])
    const untouched = await db.eventRegistrant.findUnique({ where: { id: oneTimeReg.id } })
    expect(untouched?.attendedAt).toBeNull()
  })

  it("skips a recurring event whose link names no session for the day", async () => {
    const cluster = await seedCluster()
    const recurring = await seedRecurring()
    await seedSession(recurring.id, OTHER_DAY)
    await link(cluster.id, recurring.id, null)
    const member = await seedMember()
    const reg = await register(recurring.id, { memberId: member.id })

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recorded).toEqual([])
    expect(result.data.skipped[0].reason).toBe("noSession")
    expect(await db.occurrenceAttendee.count({ where: { registrantId: reg.id } })).toBe(0)
  })

  it("refuses everything while the kiosk switch is off", async () => {
    const { cluster, oneTime } = await seedDay()
    await db.eventCluster.update({
      where: { id: cluster.id },
      data: { checkInIsOpen: false },
    })
    const member = await seedMember()
    const reg = await register(oneTime.id, { memberId: member.id })

    const lookup = await lookupClusterCheckin(cluster.publicToken, PHONE)
    const checkin = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(lookup.success).toBe(false)
    expect(checkin.success).toBe(false)
    const untouched = await db.eventRegistrant.findUnique({ where: { id: reg.id } })
    expect(untouched?.attendedAt).toBeNull()
  })

  // The action takes a person key and nothing else precisely so this can't work:
  // the rows are re-resolved from the cluster's own events every time.
  it("cannot stamp a registrant of an event outside the cluster", async () => {
    const { cluster } = await seedDay()
    const outside = await seedOneTime("Someone Else's Event")
    const member = await seedMember()
    const reg = await register(outside.id, { memberId: member.id })

    const result = await checkInToCluster(cluster.publicToken, `member:${member.id}`)

    expect(result.success).toBe(false)
    const untouched = await db.eventRegistrant.findUnique({ where: { id: reg.id } })
    expect(untouched?.attendedAt).toBeNull()
  })

  it("refuses an unknown token", async () => {
    const result = await checkInToCluster("not-a-token", "member:nobody")
    expect(result).toEqual({ success: false, error: "Event day not found." })
  })

  it("refuses a day with no events yet", async () => {
    const cluster = await seedCluster()
    const result = await checkInToCluster(cluster.publicToken, "member:nobody")
    expect(result.success).toBe(false)
    expect(await lookupClusterCheckin(cluster.publicToken, PHONE)).toEqual({
      success: true,
      data: null,
    })
  })
})
