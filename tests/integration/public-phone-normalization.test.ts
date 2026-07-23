import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { lookupVolunteer, submitVolunteerInfo } from "@/app/events/[id]/volunteer-info/actions"
import { lookupMemberByMobile } from "@/app/volunteers/sign-up-actions"
import { verifyCatchMechFaci } from "@/app/events/[id]/catch-mech/actions"

const CANONICAL = "+63 918 222 3333"
const LOCAL = "09182223333"

beforeEach(async () => {
  await db.$executeRaw`
    TRUNCATE
      "CatchMechSession", "BreakoutGroup", "Volunteer", "CommitteeRole",
      "VolunteerCommittee", "SmallGroup", "SchedulePreference", "MemberLog",
      "Member", "Event"
    RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

async function seedEventAndMember() {
  const event = await db.event.create({
    data: { name: "Phone Norm", type: "OneTime", startDate: new Date(), endDate: new Date() },
    select: { id: true },
  })
  const member = await db.member.create({
    data: { firstName: "Dina", lastName: "Santos", dateJoined: new Date(), language: [], phone: CANONICAL },
    select: { id: true },
  })
  return { eventId: event.id, memberId: member.id }
}

describe("public phone normalization", () => {
  it("submitVolunteerInfo stores a canonical phone even when given local format", async () => {
    const { eventId, memberId } = await seedEventAndMember()
    const committee = await db.volunteerCommittee.create({ data: { name: "Music", eventId }, select: { id: true } })
    const role = await db.committeeRole.create({ data: { name: "Vocals", committeeId: committee.id }, select: { id: true } })
    await db.volunteer.create({ data: { memberId, eventId, committeeId: committee.id, preferredRoleId: role.id, status: "Pending" } })

    const res = await submitVolunteerInfo({
      memberId, eventId,
      firstName: "Dina", lastName: "Santos", email: null,
      phone: LOCAL,
      leadershipStatus: "none", groupId: null, groupFields: null,
    })
    expect(res.success).toBe(true)
    const updated = await db.member.findUnique({ where: { id: memberId }, select: { phone: true } })
    expect(updated?.phone).toBe(CANONICAL)
  })

  it("lookupVolunteer finds the member when the number is typed in local format", async () => {
    const { eventId, memberId } = await seedEventAndMember()
    const committee = await db.volunteerCommittee.create({ data: { name: "Music", eventId }, select: { id: true } })
    const role = await db.committeeRole.create({ data: { name: "Vocals", committeeId: committee.id }, select: { id: true } })
    await db.volunteer.create({ data: { memberId, eventId, committeeId: committee.id, preferredRoleId: role.id, status: "Pending" } })

    const res = await lookupVolunteer(eventId, LOCAL)
    expect(res.success).toBe(true)
    expect(res.success && res.data.memberId).toBe(memberId)
  })

  it("lookupMemberByMobile (volunteer signup) matches local format against a canonical record", async () => {
    const { memberId } = await seedEventAndMember()
    const found = await lookupMemberByMobile(LOCAL)
    expect(found?.id).toBe(memberId)
  })

  it("verifyCatchMechFaci matches a facilitator by local-format number", async () => {
    const { eventId, memberId } = await seedEventAndMember()
    const committee = await db.volunteerCommittee.create({ data: { name: "Facis", eventId }, select: { id: true } })
    const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id }, select: { id: true } })
    const volunteer = await db.volunteer.create({
      data: { memberId, eventId, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
      select: { id: true },
    })
    const breakout = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId, facilitatorId: volunteer.id },
      select: { id: true },
    })

    const res = await verifyCatchMechFaci(eventId, breakout.id, LOCAL)
    expect(res.success).toBe(true)
    expect(res.success && typeof res.data.token).toBe("string")
  })
})
