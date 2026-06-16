import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

import { db } from "@/lib/db"
import {
  deleteVolunteersBatch,
  setVolunteersStatusBatch,
} from "@/app/(event)/event/[id]/volunteers/actions"
import { importBreakoutGroups } from "@/app/(event)/event/[id]/breakouts/import-actions"
import type { RowResolution } from "@/lib/import/types"

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

describe("importBreakoutGroups", () => {
  it("creates breakout groups with resolved life stage, linked group, and a schedule", async () => {
    const event = await db.event.create({ data: { name: "Conf", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Professional", order: 1 } })
    const linked = await db.smallGroup.create({ data: { name: "Eastwood Pioneers" } })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row({
        name: "Group 1",
        linkedSmallGroupName: "eastwood pioneers",
        lifeStage: "young professional",
        genderFocus: "Mixed",
        language: "English",
        ageRangeMin: "21",
        ageRangeMax: "35",
        meetingFormat: "InPerson",
        memberLimit: "12",
        scheduleDayOfWeek: "Wednesday",
        scheduleTime: "7:00 PM",
      }),
    ])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.created).toBe(1)

    const created = await db.breakoutGroup.findFirst({
      where: { eventId: event.id, name: "Group 1" },
      include: { schedules: true },
    })
    expect(created?.lifeStageId).toBe(lifeStage.id)
    expect(created?.linkedSmallGroupId).toBe(linked.id)
    expect(created?.genderFocus).toBe("Mixed")
    expect(created?.language).toEqual(["English"])
    expect(created?.memberLimit).toBe(12)
    expect(created?.schedules).toHaveLength(1)
    expect(created?.schedules[0]).toMatchObject({ dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" })
  })

  it("skips a row whose linked small group name does not exist", async () => {
    const event = await db.event.create({ data: { name: "Conf2", type: "OneTime", startDate: new Date(), endDate: new Date() } })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row({ name: "Group X", linkedSmallGroupName: "Nonexistent" }),
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(0)
      expect(result.data.skipped).toBe(1)
      expect(result.data.errors[0].message).toContain("No small group found")
    }
    expect(await db.breakoutGroup.count()).toBe(0)
  })

  it("enriches an existing breakout when re-importing with use-existing", async () => {
    const event = await db.event.create({ data: { name: "Conf3", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const existing = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Group A", language: [], locationCity: null },
    })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      row(
        { name: "Group A", locationCity: "Quezon City" },
        { resolution: "use-existing", existingId: existing.id }
      ),
    ])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)
    expect((await db.breakoutGroup.findUnique({ where: { id: existing.id } }))?.locationCity).toBe("Quezon City")
  })
})
