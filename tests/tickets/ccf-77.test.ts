import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { db } from "@/lib/db"
import { FacilitatorRole } from "@/app/generated/prisma/client"
import {
  assignSubFacilitator,
  removeSubFacilitator,
} from "@/app/(event)/event/[id]/sessions/[occurrenceId]/sub-facilitator-actions"

/**
 * CCF-77 — Assign sub-facilitators for absent facilitators in an Event session
 *
 * Sub-facilitators are session-scoped (per EventOccurrence + BreakoutGroup + role).
 * They do NOT mutate BreakoutGroup.facilitatorId / coFacilitatorId.
 * One sub per role per session enforced via @@unique.
 */

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedBase() {
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
  const breakoutGroup = await db.breakoutGroup.create({
    data: { name: "Table 1", eventId: event.id },
  })
  return { event, occurrence, committee, role, breakoutGroup }
}

async function seedVolunteer(eventId: string, committeeId: string, roleId: string, name = "Sub Person") {
  const [firstName, ...rest] = name.split(" ")
  const lastName = rest.join(" ") || "Volunteer"
  const member = await db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId, preferredRoleId: roleId, status: "Confirmed" },
  })
  return { member, volunteer }
}

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceSubFacilitator", "OccurrenceAttendee", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── assignSubFacilitator ──────────────────────────────────────────────────────

describe("CCF-77 — assignSubFacilitator", () => {
  it("creates a Facilitator sub for an occurrence", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id, "Ana Cruz")

    const result = await assignSubFacilitator(
      occurrence.id,
      breakoutGroup.id,
      FacilitatorRole.Facilitator,
      volunteer.id,
    )

    expect(result.success).toBe(true)

    const record = await db.occurrenceSubFacilitator.findUnique({
      where: {
        occurrenceId_breakoutGroupId_role: {
          occurrenceId: occurrence.id,
          breakoutGroupId: breakoutGroup.id,
          role: FacilitatorRole.Facilitator,
        },
      },
    })
    expect(record).not.toBeNull()
    expect(record?.substituteId).toBe(volunteer.id)
  })

  it("creates a CoFacilitator sub independently for the same occurrence", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer: sub1 } = await seedVolunteer(event.id, committee.id, role.id, "Sub Faci")
    const { volunteer: sub2 } = await seedVolunteer(event.id, committee.id, role.id, "Sub CoFaci")

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, sub1.id)
    const result = await assignSubFacilitator(
      occurrence.id,
      breakoutGroup.id,
      FacilitatorRole.CoFacilitator,
      sub2.id,
    )

    expect(result.success).toBe(true)

    const [fac, coFac] = await Promise.all([
      db.occurrenceSubFacilitator.findUnique({
        where: { occurrenceId_breakoutGroupId_role: { occurrenceId: occurrence.id, breakoutGroupId: breakoutGroup.id, role: FacilitatorRole.Facilitator } },
      }),
      db.occurrenceSubFacilitator.findUnique({
        where: { occurrenceId_breakoutGroupId_role: { occurrenceId: occurrence.id, breakoutGroupId: breakoutGroup.id, role: FacilitatorRole.CoFacilitator } },
      }),
    ])
    expect(fac?.substituteId).toBe(sub1.id)
    expect(coFac?.substituteId).toBe(sub2.id)
  })

  it("replaces an existing sub when called again for the same occurrence+group+role (upsert)", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer: sub1 } = await seedVolunteer(event.id, committee.id, role.id, "First Sub")
    const { volunteer: sub2 } = await seedVolunteer(event.id, committee.id, role.id, "Second Sub")

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, sub1.id)
    const result = await assignSubFacilitator(
      occurrence.id,
      breakoutGroup.id,
      FacilitatorRole.Facilitator,
      sub2.id,
    )

    expect(result.success).toBe(true)

    const records = await db.occurrenceSubFacilitator.findMany({
      where: { occurrenceId: occurrence.id, breakoutGroupId: breakoutGroup.id, role: FacilitatorRole.Facilitator },
    })
    // Only one record per role — no duplicates
    expect(records).toHaveLength(1)
    expect(records[0].substituteId).toBe(sub2.id)
  })

  it("does NOT mutate BreakoutGroup.facilitatorId when assigning a sub", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id, "The Sub")

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, volunteer.id)

    const bg = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
    expect(bg?.facilitatorId).toBeNull()
  })

  it("returns error when occurrenceId does not exist", async () => {
    const { event, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id)

    const result = await assignSubFacilitator(
      "nonexistent-id",
      breakoutGroup.id,
      FacilitatorRole.Facilitator,
      volunteer.id,
    )

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toBe("Occurrence not found.")
  })

  it("subs for two different breakout groups in the same occurrence are independent", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const bg2 = await db.breakoutGroup.create({ data: { name: "Table 2", eventId: event.id } })
    const { volunteer: sub1 } = await seedVolunteer(event.id, committee.id, role.id, "Sub Alpha")
    const { volunteer: sub2 } = await seedVolunteer(event.id, committee.id, role.id, "Sub Beta")

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, sub1.id)
    const result = await assignSubFacilitator(occurrence.id, bg2.id, FacilitatorRole.Facilitator, sub2.id)

    expect(result.success).toBe(true)
    const all = await db.occurrenceSubFacilitator.findMany({ where: { occurrenceId: occurrence.id } })
    expect(all).toHaveLength(2)
  })
})

// ─── removeSubFacilitator ──────────────────────────────────────────────────────

describe("CCF-77 — removeSubFacilitator", () => {
  it("removes an assigned sub-facilitator", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id)

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, volunteer.id)
    const result = await removeSubFacilitator(
      occurrence.id,
      breakoutGroup.id,
      FacilitatorRole.Facilitator,
    )

    expect(result.success).toBe(true)
    const record = await db.occurrenceSubFacilitator.findUnique({
      where: { occurrenceId_breakoutGroupId_role: { occurrenceId: occurrence.id, breakoutGroupId: breakoutGroup.id, role: FacilitatorRole.Facilitator } },
    })
    expect(record).toBeNull()
  })

  it("is a no-op (success) when no sub exists for that role", async () => {
    const { occurrence, breakoutGroup } = await seedBase()

    const result = await removeSubFacilitator(
      occurrence.id,
      breakoutGroup.id,
      FacilitatorRole.Facilitator,
    )

    expect(result.success).toBe(true)
  })

  it("removes only the targeted role, leaving the other role's sub intact", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer: sub1 } = await seedVolunteer(event.id, committee.id, role.id, "Faci Sub")
    const { volunteer: sub2 } = await seedVolunteer(event.id, committee.id, role.id, "CoFaci Sub")

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, sub1.id)
    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.CoFacilitator, sub2.id)

    await removeSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator)

    const remaining = await db.occurrenceSubFacilitator.findMany({
      where: { occurrenceId: occurrence.id, breakoutGroupId: breakoutGroup.id },
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].role).toBe(FacilitatorRole.CoFacilitator)
    expect(remaining[0].substituteId).toBe(sub2.id)
  })
})

// ─── Regression ───────────────────────────────────────────────────────────────

describe("CCF-77 — regression", () => {
  it("sub-facilitator record is scoped to a specific occurrence, not all occurrences of an event", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const occurrence2 = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-05-25T00:00:00Z") },
    })
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id)

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, volunteer.id)

    const inOther = await db.occurrenceSubFacilitator.findUnique({
      where: { occurrenceId_breakoutGroupId_role: { occurrenceId: occurrence2.id, breakoutGroupId: breakoutGroup.id, role: FacilitatorRole.Facilitator } },
    })
    expect(inOther).toBeNull()
  })

  it("deleting an occurrence cascades and removes its sub-facilitator records", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id)

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, volunteer.id)

    await db.eventOccurrence.delete({ where: { id: occurrence.id } })

    const record = await db.occurrenceSubFacilitator.findMany({ where: { occurrenceId: occurrence.id } })
    expect(record).toHaveLength(0)
  })

  it("deleting a breakout group cascades and removes its sub-facilitator records", async () => {
    const { event, occurrence, committee, role, breakoutGroup } = await seedBase()
    const { volunteer } = await seedVolunteer(event.id, committee.id, role.id)

    await assignSubFacilitator(occurrence.id, breakoutGroup.id, FacilitatorRole.Facilitator, volunteer.id)

    await db.breakoutGroup.delete({ where: { id: breakoutGroup.id } })

    const record = await db.occurrenceSubFacilitator.findMany({ where: { breakoutGroupId: breakoutGroup.id } })
    expect(record).toHaveLength(0)
  })
})
