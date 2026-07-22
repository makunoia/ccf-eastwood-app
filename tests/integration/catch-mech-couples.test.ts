import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { findSpouseOfPerson } from "@/lib/family-links"
import {
  confirmCatchMechCoupleRequests,
  findCatchMechSmallGroupMatches,
} from "@/app/(event)/event/[id]/catch-mech/matching-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "EventRegistrant", "Event", "BreakoutGroup", "MatchingWeightConfig", "SchedulePreference" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEventWithBreakout() {
  const event = await db.event.create({
    data: {
      name: "Retreat",
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
  const breakout = await db.breakoutGroup.create({
    data: { name: "Breakout A", eventId: event.id },
  })
  return { event, breakout }
}

async function seedGuestCouple() {
  const husband = await db.guest.create({
    data: { firstName: "Hubby", lastName: "Cruz", email: "hubby@x.com", language: [] },
  })
  const wife = await db.guest.create({
    data: { firstName: "Wifey", lastName: "Cruz", email: "wifey@x.com", language: [] },
  })
  const family = await db.family.create({ data: { name: "Cruz Family" } })
  await db.familyMember.createMany({
    data: [
      { familyId: family.id, guestId: husband.id, role: "FatherHusband" },
      { familyId: family.id, guestId: wife.id, role: "MotherWife" },
    ],
  })
  return { husband, wife, family }
}

describe("findSpouseOfPerson — guest-capable derivation", () => {
  it("resolves a guest's guest-spouse", async () => {
    const { husband, wife } = await seedGuestCouple()
    const spouse = await findSpouseOfPerson({ guestId: husband.id })
    expect(spouse?.guestId).toBe(wife.id)
    expect(spouse?.memberId).toBeNull()
    expect(spouse?.firstName).toBe("Wifey")
  })

  it("resolves a guest's member-spouse with their current group", async () => {
    const group = await db.smallGroup.create({ data: { name: "G" } })
    const memberWife = await db.member.create({
      data: {
        firstName: "MemberWife", lastName: "Cruz", dateJoined: new Date(),
        language: [], smallGroupId: group.id, groupStatus: "Member",
      },
    })
    const guestHusband = await db.guest.create({
      data: { firstName: "GuestHusband", lastName: "Cruz", language: [] },
    })
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, guestId: guestHusband.id, role: "FatherHusband" },
        { familyId: family.id, memberId: memberWife.id, role: "MotherWife" },
      ],
    })

    const spouse = await findSpouseOfPerson({ guestId: guestHusband.id })
    expect(spouse?.memberId).toBe(memberWife.id)
    expect(spouse?.smallGroupId).toBe(group.id)
  })

  it("returns null for a guest with no parent role or no partner", async () => {
    const loner = await db.guest.create({
      data: { firstName: "Solo", lastName: "G", language: [] },
    })
    expect(await findSpouseOfPerson({ guestId: loner.id })).toBeNull()
  })
})

describe("confirmCatchMechCoupleRequests", () => {
  async function seedPendingCouple(groupOverrides: { memberLimit?: number; groupType?: "Regular" | "Couples" } = {}) {
    const { event, breakout } = await seedEventWithBreakout()
    const { husband, wife, family } = await seedGuestCouple()
    const group = await db.smallGroup.create({
      data: {
        name: "Couples SG",
        groupType: groupOverrides.groupType ?? "Couples",
        genderFocus: "Mixed",
        memberLimit: groupOverrides.memberLimit ?? null,
      },
    })
    const [regH, regW] = await Promise.all([
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: husband.id } }),
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: wife.id } }),
    ])
    const [reqH, reqW] = await Promise.all([
      db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: husband.id, breakoutGroupId: breakout.id },
      }),
      db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: wife.id, breakoutGroupId: breakout.id },
      }),
    ])
    return { event, breakout, husband, wife, family, group, regH, regW, reqH, reqW }
  }

  it("confirms both requests: promotes guests, repoints registrants and family links, writes logs", async () => {
    const { event, husband, wife, family, group, reqH, reqW } = await seedPendingCouple()

    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, reqW.id)
    expect(result.success).toBe(true)

    // Both requests confirmed and repointed to the new members
    const [updatedH, updatedW] = await Promise.all([
      db.smallGroupMemberRequest.findUnique({ where: { id: reqH.id } }),
      db.smallGroupMemberRequest.findUnique({ where: { id: reqW.id } }),
    ])
    expect(updatedH?.status).toBe("Confirmed")
    expect(updatedW?.status).toBe("Confirmed")
    expect(updatedH?.memberId).toBeTruthy()
    expect(updatedW?.memberId).toBeTruthy()
    expect(updatedH?.guestId).toBeNull()

    // Both guests promoted into the group
    const [gH, gW] = await Promise.all([
      db.guest.findUnique({ where: { id: husband.id } }),
      db.guest.findUnique({ where: { id: wife.id } }),
    ])
    expect(gH?.memberId).toBeTruthy()
    expect(gW?.memberId).toBeTruthy()

    const members = await db.member.findMany({ where: { smallGroupId: group.id } })
    expect(members).toHaveLength(2)
    expect(members.every((m) => m.groupStatus === "Member")).toBe(true)

    // Family links repointed from guests to the new members
    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links.every((l) => l.guestId === null && l.memberId !== null)).toBe(true)

    // Registrants repointed
    const regs = await db.eventRegistrant.findMany({ where: { eventId: event.id } })
    expect(regs.every((r) => r.guestId === null && r.memberId !== null)).toBe(true)

    // Two confirmations + two member-added logs
    const logs = await db.smallGroupLog.findMany({ where: { smallGroupId: group.id } })
    expect(logs.filter((l) => l.action === "TempAssignmentConfirmed")).toHaveLength(2)
    expect(logs.filter((l) => l.action === "MemberAdded")).toHaveLength(2)
  })

  it("rejects when the target is not a Couples group", async () => {
    const { event, reqH, reqW } = await seedPendingCouple({ groupType: "Regular" })
    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, reqW.id)
    expect(result.success).toBe(false)
  })

  it("rejects when the requests target different groups", async () => {
    const { event, reqH, wife } = await seedPendingCouple()
    const otherGroup = await db.smallGroup.create({
      data: { name: "Other", groupType: "Couples" },
    })
    const otherReq = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: otherGroup.id, guestId: wife.id },
    })
    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, otherReq.id)
    expect(result.success).toBe(false)
  })

  it("rejects when one request is already resolved", async () => {
    const { event, reqH, reqW } = await seedPendingCouple()
    await db.smallGroupMemberRequest.update({
      where: { id: reqW.id },
      data: { status: "Confirmed", resolvedAt: new Date() },
    })
    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, reqW.id)
    expect(result.success).toBe(false)
  })

  it("rejects when the member limit cannot fit both, changing nothing", async () => {
    const { event, husband, wife, reqH, reqW } = await seedPendingCouple({ memberLimit: 1 })
    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, reqW.id)
    expect(result.success).toBe(false)

    const [gH, gW] = await Promise.all([
      db.guest.findUnique({ where: { id: husband.id } }),
      db.guest.findUnique({ where: { id: wife.id } }),
    ])
    expect(gH?.memberId).toBeNull()
    expect(gW?.memberId).toBeNull()
    expect(await db.member.count()).toBe(0)
  })

  it("rejects the same request passed twice", async () => {
    const { event, reqH } = await seedPendingCouple()
    const result = await confirmCatchMechCoupleRequests(event.id, reqH.id, reqH.id)
    expect(result.success).toBe(false)
  })
})

describe("catch-mech matching — couples groups gated on having a spouse", () => {
  it("includes couples groups for a registrant with a spouse, excludes them otherwise", async () => {
    const { event } = await seedEventWithBreakout()
    const regularGroup = await db.smallGroup.create({ data: { name: "Regular G" } })
    const couplesGroup = await db.smallGroup.create({
      data: { name: "Couples G", groupType: "Couples", genderFocus: "Mixed" },
    })

    const { husband } = await seedGuestCouple()
    const single = await db.guest.create({
      data: { firstName: "Single", lastName: "Guy", language: [] },
    })
    const [regMarried, regSingle] = await Promise.all([
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: husband.id } }),
      db.eventRegistrant.create({ data: { eventId: event.id, guestId: single.id } }),
    ])

    const marriedMatches = await findCatchMechSmallGroupMatches(regMarried.id, event.id, "all")
    expect(marriedMatches.success).toBe(true)
    if (!marriedMatches.success) return
    const marriedGroupIds = marriedMatches.data.flatMap((l) => l.matches.map((m) => m.groupId))
    expect(marriedGroupIds).toContain(couplesGroup.id)
    expect(marriedGroupIds).toContain(regularGroup.id)

    const singleMatches = await findCatchMechSmallGroupMatches(regSingle.id, event.id, "all")
    expect(singleMatches.success).toBe(true)
    if (!singleMatches.success) return
    const singleGroupIds = singleMatches.data.flatMap((l) => l.matches.map((m) => m.groupId))
    expect(singleGroupIds).not.toContain(couplesGroup.id)
    expect(singleGroupIds).toContain(regularGroup.id)
  })
})
