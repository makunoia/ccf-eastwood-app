import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import {
  getFamilyDetail,
  getMemberDetail,
  getMinistryDetail,
  getSmallGroupStats,
  listEventOccurrences,
  queryEvents,
  querySmallGroupRequests,
} from "@/lib/assistant/queries"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "Family", "FamilyMember", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "LifeStage", "Ministry", "Event", "EventMinistry", "EventOccurrence" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("MCP query capabilities", () => {
  it("filters events by ministry, type, and overlapping date range", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
    const ministry = await db.ministry.create({ data: { name: "Elevate", lifeStageId: lifeStage.id } })
    const included = await db.event.create({
      data: {
        name: "YA Retreat",
        type: "MultiDay",
        startDate: new Date("2026-10-10T00:00:00Z"),
        endDate: new Date("2026-10-12T00:00:00Z"),
        ministries: { create: { ministryId: ministry.id } },
      },
    })
    await db.event.create({ data: { name: "Kids Day", type: "OneTime", startDate: new Date("2026-10-11T00:00:00Z"), endDate: new Date("2026-10-11T00:00:00Z") } })

    const result = await queryEvents({
      timeframe: "all",
      type: "MultiDay",
      ministryId: ministry.id,
      startDateFrom: new Date("2026-10-11T00:00:00Z"),
      startDateTo: new Date("2026-10-11T23:59:59Z"),
    })
    expect(result.rows.map((event) => event.id)).toEqual([included.id])
    expect((await getMinistryDetail(ministry.id))?.events[0]).toMatchObject({ id: included.id, name: "YA Retreat" })
    expect((await getMinistryDetail(ministry.id, []))?.events).toEqual([])

    const member = await db.member.create({ data: { firstName: "Event", lastName: "Guest", dateJoined: new Date(), language: [] } })
    await db.eventRegistrant.create({ data: { eventId: included.id, memberId: member.id } })
    expect((await getMemberDetail(member.id))?.recentEventRegistrations).toHaveLength(1)
    expect((await getMemberDetail(member.id, []))?.recentEventRegistrations).toEqual([])
  })

  it("returns complete family roles, sessions, and DGroup request context", async () => {
    const member = await db.member.create({ data: { firstName: "Mia", lastName: "Reyes", dateJoined: new Date(), language: [] } })
    const guest = await db.guest.create({ data: { firstName: "Noah", lastName: "Reyes", language: [] } })
    const family = await db.family.create({
      data: {
        name: "Reyes Family",
        members: {
          create: [
            { memberId: member.id, role: "MotherWife" },
            { guestId: guest.id, role: "Child" },
          ],
        },
      },
    })
    const event = await db.event.create({ data: { name: "Weekly Service", type: "Recurring", startDate: new Date(), endDate: new Date() } })
    const occurrence = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-10-18T02:00:00Z"), isOpen: true } })
    const group = await db.smallGroup.create({ data: { name: "Reyes DGroup", leaderId: member.id, memberLimit: 1, language: [] } })
    await db.member.update({ where: { id: member.id }, data: { smallGroupId: group.id, groupStatus: "Leader" } })
    const request = await db.smallGroupMemberRequest.create({ data: { guestId: guest.id, smallGroupId: group.id, sourceEventId: event.id, origin: "RegistrationIntent" } })

    const familyDetail = await getFamilyDetail(family.id)
    expect(familyDetail?.members.map((row) => row.role)).toEqual(["MotherWife", "Child"])
    expect((await listEventOccurrences(event.id)).rows[0]).toMatchObject({ id: occurrence.id, isOpen: true, attendeeCount: 0 })
    expect((await querySmallGroupRequests({ status: "Pending" })).rows[0]).toMatchObject({
      id: request.id,
      person: { id: guest.id, kind: "guest", name: "Noah Reyes" },
      sourceEvent: { id: event.id, name: "Weekly Service" },
    })
    expect(await getSmallGroupStats()).toMatchObject({
      totalGroups: 1,
      totalRoster: 1,
      groupsAtCapacity: 1,
      pendingRequests: 1,
    })
  })
})
