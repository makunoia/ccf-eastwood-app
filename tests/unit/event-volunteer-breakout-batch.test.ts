import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

import { db } from "@/lib/db"
import {
  deleteVolunteersBatch,
  setVolunteersStatusBatch,
} from "@/app/(event)/event/[id]/volunteers/actions"
import { importBreakoutGroups } from "@/app/(event)/event/[id]/breakouts/import-actions"
import type { RowResolution } from "@/lib/import/types"
import { formatPhilippinePhone } from "@/lib/utils"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "SmallGroup", "Member", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// Build the minimum graph required for a volunteer: event + committee + role + member.
async function seedVolunteer(eventId: string, opts?: { status?: "Pending" | "Confirmed" | "Rejected" }) {
  const committee = await db.volunteerCommittee.create({
    data: { eventId, name: `Committee ${Math.random()}` },
  })
  const role = await db.committeeRole.create({
    data: { committeeId: committee.id, name: "Greeter" },
  })
  const member = await db.member.create({
    data: { firstName: "Vol", lastName: "Unteer", language: [], dateJoined: new Date() },
  })
  return db.volunteer.create({
    data: {
      memberId: member.id,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: opts?.status ?? "Pending",
    },
  })
}

describe("setVolunteersStatusBatch", () => {
  it("updates status for the selected volunteers, scoped to the event", async () => {
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const v1 = await seedVolunteer(event.id)
    const v2 = await seedVolunteer(event.id)

    const result = await setVolunteersStatusBatch(event.id, [v1.id, v2.id], "Confirmed")

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(2)
    expect((await db.volunteer.findUnique({ where: { id: v1.id } }))?.status).toBe("Confirmed")
    expect((await db.volunteer.findUnique({ where: { id: v2.id } }))?.status).toBe("Confirmed")
  })

  it("ignores volunteers belonging to another event", async () => {
    const eventA = await db.event.create({ data: { name: "A", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const eventB = await db.event.create({ data: { name: "B", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const vA = await seedVolunteer(eventA.id)
    const vB = await seedVolunteer(eventB.id)

    const result = await setVolunteersStatusBatch(eventA.id, [vA.id, vB.id], "Rejected")

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)
    expect((await db.volunteer.findUnique({ where: { id: vB.id } }))?.status).toBe("Pending")
  })

  it("rejects an invalid status value", async () => {
    const event = await db.event.create({ data: { name: "C", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const v = await seedVolunteer(event.id)

    const result = await setVolunteersStatusBatch(event.id, [v.id], "Bogus")
    expect(result.success).toBe(false)
    expect((await db.volunteer.findUnique({ where: { id: v.id } }))?.status).toBe("Pending")
  })
})

describe("deleteVolunteersBatch", () => {
  it("removes the selected volunteers and reports the count", async () => {
    const event = await db.event.create({ data: { name: "D", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const v1 = await seedVolunteer(event.id)
    const v2 = await seedVolunteer(event.id)

    const result = await deleteVolunteersBatch(event.id, [v1.id, v2.id])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deleted).toBe(2)
      expect(result.data.failed).toHaveLength(0)
    }
    expect(await db.volunteer.count({ where: { eventId: event.id } })).toBe(0)
  })
})

// ─── Breakout import ───────────────────────────────────────────────────────────

function row(mapped: Record<string, string>, extra?: { resolution?: RowResolution; existingId?: string }) {
  return {
    mapped,
    resolution: extra?.resolution ?? ("use-existing" as RowResolution),
    existingId: extra?.existingId,
  }
}

// Seed an event volunteer whose member carries a canonical mobile and leads
// exactly one small group — the shape the import matches a facilitator against
// (and auto-links that single led group as the breakout's small group).
async function seedFacilitator(
  eventId: string,
  opts: { phone: string; leadsGroups?: number }
) {
  const member = await db.member.create({
    data: {
      firstName: "Faci",
      lastName: "Litator",
      language: [],
      dateJoined: new Date(),
      phone: formatPhilippinePhone(opts.phone),
    },
  })
  const ledGroupIds: string[] = []
  for (let i = 0; i < (opts.leadsGroups ?? 0); i++) {
    const g = await db.smallGroup.create({
      data: { name: `Led Group ${i} ${Math.random()}`, leaderId: member.id },
    })
    ledGroupIds.push(g.id)
  }
  const committee = await db.volunteerCommittee.create({ data: { eventId, name: `C ${Math.random()}` } })
  const role = await db.committeeRole.create({ data: { committeeId: committee.id, name: "Facilitator" } })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId, committeeId: committee.id, preferredRoleId: role.id },
  })
  return { volunteer, member, ledGroupIds }
}

describe("importBreakoutGroups", () => {
  it("creates a breakout group, matching the facilitator by mobile and auto-linking their sole small group", async () => {
    const event = await db.event.create({ data: { name: "Conf", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const { volunteer, ledGroupIds } = await seedFacilitator(event.id, { phone: "09171234567", leadsGroups: 1 })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row({
        name: "Group 1",
        facilitatorMobile: "0917 123 4567",
        memberLimit: "12",
      }),
    ])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.created).toBe(1)

    const created = await db.breakoutGroup.findFirst({
      where: { eventId: event.id, name: "Group 1" },
    })
    expect(created?.facilitatorId).toBe(volunteer.id)
    expect(created?.linkedSmallGroupId).toBe(ledGroupIds[0])
    expect(created?.memberLimit).toBe(12)
  })

  it("skips a row whose facilitator mobile matches no event volunteer", async () => {
    const event = await db.event.create({ data: { name: "Conf2", type: "OneTime", startDate: new Date(), endDate: new Date() } })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row({ name: "Group X", facilitatorMobile: "0917 000 0000" }),
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(0)
      expect(result.data.skipped).toBe(1)
      expect(result.data.errors[0].message).toContain("No event volunteer found")
    }
    expect(await db.breakoutGroup.count()).toBe(0)
  })

  it("enriches an existing breakout when re-importing with use-existing", async () => {
    const event = await db.event.create({ data: { name: "Conf3", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const existing = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Group A", language: [], memberLimit: null },
    })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row(
        { name: "Group A", memberLimit: "15" },
        { resolution: "use-existing", existingId: existing.id }
      ),
    ])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)
    expect((await db.breakoutGroup.findUnique({ where: { id: existing.id } }))?.memberLimit).toBe(15)
  })
})
