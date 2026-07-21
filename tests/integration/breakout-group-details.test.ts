import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getBreakoutGroupDetails } from "@/app/(dashboard)/events/matching-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "Event", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

describe("getBreakoutGroupDetails", () => {
  it("returns every schedule slot with its end time", async () => {
    const event = await seedEvent()
    const stage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
    const group = await db.breakoutGroup.create({
      data: {
        name: "Table 1",
        eventId: event.id,
        genderFocus: "Mixed",
        language: ["English"],
        locationCity: "Makati",
        meetingFormat: "InPerson",
        memberLimit: 8,
        lifeStages: { connect: { id: stage.id } },
        schedules: {
          create: [
            { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
            { dayOfWeek: 0, timeStart: "14:00", timeEnd: null },
          ],
        },
      },
    })

    const res = await getBreakoutGroupDetails(group.id, event.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.name).toBe("Table 1")
    expect(res.data.lifeStages).toEqual([{ name: "Young Adults" }])
    expect(res.data.genderFocus).toBe("Mixed")
    expect(res.data.memberLimit).toBe(8)
    // Ordered by day then start, and the end time is preserved (the bug the
    // old detail page had — it dropped timeEnd and never rendered schedules).
    expect(res.data.schedules).toEqual([
      { dayOfWeek: 0, timeStart: "14:00", timeEnd: null },
      { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
    ])
  })

  it("resolves member, guest and walk-in display names", async () => {
    const event = await seedEvent()
    const group = await db.breakoutGroup.create({ data: { name: "Table 2", eventId: event.id } })

    const member = await db.member.create({
      data: { firstName: "Mary", lastName: "Member", dateJoined: new Date(), language: [] },
    })
    const guest = await db.guest.create({
      data: { firstName: "Gina", lastName: "Guest", language: [] },
    })

    const memberReg = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    const guestReg = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    const walkInReg = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walter", lastName: "Walkin" },
    })
    for (const reg of [memberReg, guestReg, walkInReg]) {
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: group.id, registrantId: reg.id },
      })
    }

    const res = await getBreakoutGroupDetails(group.id, event.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    const names = res.data.members.map((m) => m.name)
    expect(names).toContain("Mary Member")
    expect(names).toContain("Gina Guest")
    expect(names).toContain("Walter Walkin")
    expect(res.data.currentCount).toBe(3)
  })

  it("exposes facilitators by name", async () => {
    const event = await seedEvent()
    const committee = await db.volunteerCommittee.create({ data: { name: "C", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id } })
    const faciMember = await db.member.create({
      data: { firstName: "Fred", lastName: "Faci", dateJoined: new Date(), language: [] },
    })
    const vol = await db.volunteer.create({
      data: { memberId: faciMember.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id },
    })
    const group = await db.breakoutGroup.create({
      data: { name: "Table 3", eventId: event.id, facilitatorId: vol.id },
    })

    const res = await getBreakoutGroupDetails(group.id, event.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.facilitator).toEqual({ firstName: "Fred", lastName: "Faci" })
    expect(res.data.coFacilitator).toBeNull()
  })

  it("404s for a group id from a different event (authz boundary)", async () => {
    const eventA = await seedEvent()
    const eventB = await seedEvent()
    const group = await db.breakoutGroup.create({ data: { name: "A's group", eventId: eventA.id } })

    const wrong = await getBreakoutGroupDetails(group.id, eventB.id)
    expect(wrong.success).toBe(false)

    const right = await getBreakoutGroupDetails(group.id, eventA.id)
    expect(right.success).toBe(true)
  })
})
