import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { db } from "@/lib/db"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"

/**
 * CCF-76 — Facilitator and Co-Facilitator attendance filter for breakout group suggestions
 *
 * A breakout group only appears in the picker if at least one of its
 * facilitator, co-facilitator, or sub-facilitator has checked in for the
 * current session.
 */

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedRecurringEvent() {
  const event = await db.event.create({
    data: { name: "Sunday Service", type: "Recurring", startDate: new Date(), endDate: new Date() },
  })
  const occurrence = await db.eventOccurrence.create({
    data: { eventId: event.id, date: new Date("2026-05-18T00:00:00Z") },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Faci Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  return { event, occurrence, committee, role }
}

async function seedOneTimeEvent() {
  const event = await db.event.create({
    data: { name: "Camp", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Faci Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  return { event, committee, role }
}

/** Creates a Member → Volunteer → EventRegistrant chain for a given event. */
async function seedFacilitator(eventId: string, committeeId: string, roleId: string, name = "Faci Person") {
  const [firstName, ...rest] = name.split(" ")
  const lastName = rest.join(" ") || "Leader"
  const member = await db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId, preferredRoleId: roleId, status: "Confirmed" },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, memberId: member.id },
  })
  return { member, volunteer, registrant }
}

/** Marks a registrant as attended for a given occurrence (Recurring/MultiDay). */
async function checkInToOccurrence(registrantId: string, occurrenceId: string) {
  return db.occurrenceAttendee.create({
    data: { occurrenceId, registrantId },
  })
}

/** Marks a registrant as attended for a OneTime event. */
async function checkInOneTime(registrantId: string) {
  return db.eventRegistrant.update({
    where: { id: registrantId },
    data: { attendedAt: new Date() },
  })
}

/** Creates a BreakoutGroup linked to a given facilitator volunteer. */
async function seedBreakoutGroup(
  eventId: string,
  name: string,
  opts: { facilitatorId?: string; coFacilitatorId?: string } = {}
) {
  return db.breakoutGroup.create({
    data: { name, eventId, ...opts },
  })
}

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceSubFacilitator", "OccurrenceAttendee", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Occurrence-based path (Recurring / MultiDay) ─────────────────────────────

describe("CCF-76 — occurrence-based filter (occurrenceId provided)", () => {
  it("returns a group whose facilitator has checked in to the occurrence", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()
    const { volunteer, registrant } = await seedFacilitator(event.id, committee.id, role.id, "Ana Cruz")
    await checkInToOccurrence(registrant.id, occurrence.id)
    const group = await seedBreakoutGroup(event.id, "Table 1", { facilitatorId: volunteer.id })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).toContain(group.id)
  })

  it("excludes a group whose facilitator has NOT checked in to the occurrence", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()
    const { volunteer } = await seedFacilitator(event.id, committee.id, role.id, "Ben Reyes")
    // No OccurrenceAttendee created — Ben has not checked in
    const group = await seedBreakoutGroup(event.id, "Table 2", { facilitatorId: volunteer.id })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).not.toContain(group.id)
  })

  it("returns a group when only the co-facilitator has checked in", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()
    const { volunteer: faci } = await seedFacilitator(event.id, committee.id, role.id, "Absent Faci")
    const { volunteer: coFaci, registrant: coRegistrant } = await seedFacilitator(
      event.id, committee.id, role.id, "Present CoFaci"
    )
    // Only co-facilitator checked in
    await checkInToOccurrence(coRegistrant.id, occurrence.id)
    const group = await seedBreakoutGroup(event.id, "Table 3", {
      facilitatorId: faci.id,
      coFacilitatorId: coFaci.id,
    })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).toContain(group.id)
  })

  it("returns a group that has an OccurrenceSubFacilitator record (even if primary faci is absent)", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()
    const { volunteer: faci } = await seedFacilitator(event.id, committee.id, role.id, "Absent Faci")
    const { volunteer: sub } = await seedFacilitator(event.id, committee.id, role.id, "Sub Person")
    const group = await seedBreakoutGroup(event.id, "Table 4", { facilitatorId: faci.id })

    // Sub-facilitator assigned for this session (no attendance record needed — just the assignment)
    await db.occurrenceSubFacilitator.create({
      data: {
        occurrenceId: occurrence.id,
        breakoutGroupId: group.id,
        role: "Facilitator",
        substituteId: sub.id,
      },
    })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).toContain(group.id)
  })

  it("excludes a group with no facilitator configured at all", async () => {
    const { event, occurrence } = await seedRecurringEvent()
    const group = await seedBreakoutGroup(event.id, "Unfacilitated Group")
    // No facilitatorId, no coFacilitatorId, no sub-facilitators

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).not.toContain(group.id)
  })

  it("does not cross-contaminate attendance from a different occurrence", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()
    const otherOccurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-05-25T00:00:00Z") },
    })
    const { volunteer, registrant } = await seedFacilitator(event.id, committee.id, role.id, "Partial Faci")
    // Checked in to the OTHER occurrence, not the current one
    await checkInToOccurrence(registrant.id, otherOccurrence.id)
    const group = await seedBreakoutGroup(event.id, "Wrong-Session Group", { facilitatorId: volunteer.id })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)

    expect(result.map((g) => g.id)).not.toContain(group.id)
  })

  it("returns multiple groups when each has a checked-in facilitator", async () => {
    const { event, occurrence, committee, role } = await seedRecurringEvent()

    const { volunteer: v1, registrant: r1 } = await seedFacilitator(event.id, committee.id, role.id, "Faci One")
    const { volunteer: v2, registrant: r2 } = await seedFacilitator(event.id, committee.id, role.id, "Faci Two")
    await checkInToOccurrence(r1.id, occurrence.id)
    await checkInToOccurrence(r2.id, occurrence.id)

    const g1 = await seedBreakoutGroup(event.id, "Group A", { facilitatorId: v1.id })
    const g2 = await seedBreakoutGroup(event.id, "Group B", { facilitatorId: v2.id })

    const result = await fetchBreakoutCandidates(event.id, occurrence.id)
    const ids = result.map((g) => g.id)

    expect(ids).toContain(g1.id)
    expect(ids).toContain(g2.id)
  })
})

// ─── OneTime path (occurrenceId = null) ───────────────────────────────────────

describe("CCF-76 — OneTime filter (occurrenceId = null)", () => {
  it("returns a group whose facilitator has attendedAt set", async () => {
    const { event, committee, role } = await seedOneTimeEvent()
    const { volunteer, registrant } = await seedFacilitator(event.id, committee.id, role.id, "Present Faci")
    await checkInOneTime(registrant.id)
    const group = await seedBreakoutGroup(event.id, "Camp Table 1", { facilitatorId: volunteer.id })

    const result = await fetchBreakoutCandidates(event.id, null)

    expect(result.map((g) => g.id)).toContain(group.id)
  })

  it("excludes a group whose facilitator has attendedAt = null", async () => {
    const { event, committee, role } = await seedOneTimeEvent()
    const { volunteer } = await seedFacilitator(event.id, committee.id, role.id, "No-Show Faci")
    const group = await seedBreakoutGroup(event.id, "Camp Table 2", { facilitatorId: volunteer.id })

    const result = await fetchBreakoutCandidates(event.id, null)

    expect(result.map((g) => g.id)).not.toContain(group.id)
  })

  it("returns a group when only the co-facilitator has attendedAt set", async () => {
    const { event, committee, role } = await seedOneTimeEvent()
    const { volunteer: faci } = await seedFacilitator(event.id, committee.id, role.id, "Absent Faci")
    const { volunteer: coFaci, registrant: coRegistrant } = await seedFacilitator(
      event.id, committee.id, role.id, "Present CoFaci"
    )
    await checkInOneTime(coRegistrant.id)
    const group = await seedBreakoutGroup(event.id, "Camp Table 3", {
      facilitatorId: faci.id,
      coFacilitatorId: coFaci.id,
    })

    const result = await fetchBreakoutCandidates(event.id, null)

    expect(result.map((g) => g.id)).toContain(group.id)
  })

  it("excludes a group with no facilitator configured", async () => {
    const { event } = await seedOneTimeEvent()
    const group = await seedBreakoutGroup(event.id, "Unconfigured Camp Group")

    const result = await fetchBreakoutCandidates(event.id, null)

    expect(result.map((g) => g.id)).not.toContain(group.id)
  })
})
