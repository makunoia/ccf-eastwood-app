import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { importBreakoutGroups } from "@/app/(event)/event/[id]/breakouts/import-actions"
import { formatPhilippinePhone } from "@/lib/utils"

// auth() is globally mocked to a SuperAdmin session in tests/setup.ts, so the
// import's permission check passes without any per-test stubbing.

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroup",
    "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry",
    "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

/**
 * Seeds an event with a confirmed volunteer (a Member identified by mobile) who
 * can be assigned as a breakout facilitator. Optionally makes that member lead a
 * single small group so the import's auto-link can pick it up.
 */
async function seedEventVolunteer(opts: { phone: string; ledGroupName?: string }) {
  const event = await db.event.create({
    data: { name: "Conference", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Breakouts", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const member = await db.member.create({
    data: { firstName: "Grace", lastName: "Lee", phone: formatPhilippinePhone(opts.phone), dateJoined: new Date(), language: [] },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
  })
  let smallGroup: { id: string } | null = null
  if (opts.ledGroupName) {
    smallGroup = await db.smallGroup.create({ data: { name: opts.ledGroupName, leaderId: member.id }, select: { id: true } })
  }
  return { event, member, volunteer, smallGroup }
}

describe("breakout group import — facilitator by mobile", () => {
  it("assigns the matched event volunteer as facilitator and auto-links their small group", async () => {
    const { event, volunteer, smallGroup } = await seedEventVolunteer({
      phone: "09170000001",
      ledGroupName: "Grace's Group",
    })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      { mapped: { name: "Group A", facilitatorMobile: "0917 000 0001" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(1)

    const created = await db.breakoutGroup.findFirst({ where: { eventId: event.id, name: "Group A" } })
    expect(created?.facilitatorId).toBe(volunteer.id)
    expect(created?.linkedSmallGroupId).toBe(smallGroup!.id)
  })

  it("leaves the small-group link null when the facilitator leads no group", async () => {
    const { event, volunteer } = await seedEventVolunteer({ phone: "09170000002" })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      { mapped: { name: "Group B", facilitatorMobile: "09170000002" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return

    const created = await db.breakoutGroup.findFirst({ where: { eventId: event.id, name: "Group B" } })
    expect(created?.facilitatorId).toBe(volunteer.id)
    expect(created?.linkedSmallGroupId).toBeNull()
  })

  it("skips the row when the mobile matches no event volunteer", async () => {
    const { event } = await seedEventVolunteer({ phone: "09170000003" })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      { mapped: { name: "Group C", facilitatorMobile: "09179999999" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(0)
    expect(result.data.skipped).toBe(1)
    expect(result.data.errors[0]?.message).toContain("No event volunteer found")

    const count = await db.breakoutGroup.count({ where: { eventId: event.id } })
    expect(count).toBe(0)
  })

  it("creates a group with no facilitator when the mobile column is blank", async () => {
    const { event } = await seedEventVolunteer({ phone: "09170000004" })

    const result = await importBreakoutGroups({ eventId: event.id }, [
      { mapped: { name: "Group D" }, resolution: "use-csv" },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.created).toBe(1)

    const created = await db.breakoutGroup.findFirst({ where: { eventId: event.id, name: "Group D" } })
    expect(created?.facilitatorId).toBeNull()
    expect(created?.linkedSmallGroupId).toBeNull()
  })
})
