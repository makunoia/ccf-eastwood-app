import { describe, it, expect, beforeEach, afterAll } from "vitest"

import { db } from "@/lib/db"
import {
  prefetchRegistrantData,
  resolveConfirmations,
  type ResolvedDecision,
} from "@/lib/catch-mech/confirmations"

/**
 * resolveConfirmations was rewritten to batch its reads and inserts instead of
 * issuing 7–9 sequential queries per person (see
 * tests/unit/catch-mech-batching.test.ts for the round-trip guard). These tests
 * pin that the *observable outcome* is unchanged against a real database —
 * batching is only worth anything if a table of ten lands exactly where a table
 * of one did.
 */

async function seedGroup(name: string) {
  const leader = await db.member.create({
    data: { firstName: "Lead", lastName: name, dateJoined: new Date(), language: [] },
    select: { id: true },
  })
  return db.smallGroup.create({
    data: { name, leaderId: leader.id, status: "Active" },
    select: { id: true },
  })
}

async function seedEvent() {
  return db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    select: { id: true },
  })
}

async function seedGuestRegistrant(
  eventId: string,
  firstName: string,
  extra: { scheduleDayOfWeek?: number; scheduleTimeStart?: string } = {}
) {
  const guest = await db.guest.create({
    data: { firstName, lastName: "Santos", language: [], ...extra },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, guestId: guest.id },
    select: { id: true },
  })
  return { guestId: guest.id, registrantId: registrant.id }
}

/** Runs the resolver the same way the server actions do — inside a transaction. */
async function apply(decisions: ResolvedDecision[], groupLabel = "Catch Mech") {
  const { registrantMap, takenEmails } = await prefetchRegistrantData(decisions)
  await db.$transaction(async (tx) => {
    await resolveConfirmations(
      null,
      null,
      decisions,
      registrantMap,
      takenEmails,
      tx,
      "Retreat",
      null,
      groupLabel
    )
  })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroupMemberRequest", "SmallGroupLog", "SmallGroup", "Member", "Guest",
    "EventRegistrant", "Event", "FamilyMember", "Family", "SchedulePreference"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("resolveConfirmations — batched writes land the same as sequential ones", () => {
  it("promotes every confirmed guest in one batch", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const people = await Promise.all(
      ["Ana", "Ben", "Cara", "Dan", "Eli"].map((n) => seedGuestRegistrant(event.id, n))
    )

    await apply(
      people.map((p) => ({
        registrantId: p.registrantId,
        status: "confirmed" as const,
        groupId: group.id,
      }))
    )

    const members = await db.member.findMany({
      where: { smallGroupId: group.id, groupStatus: "Member" },
      select: { firstName: true },
    })
    expect(members.map((m) => m.firstName).sort()).toEqual(["Ana", "Ben", "Cara", "Dan", "Eli"])

    // Each guest is linked to its own new member — not all to the first one.
    const guests = await db.guest.findMany({ select: { memberId: true } })
    expect(new Set(guests.map((g) => g.memberId)).size).toBe(5)
    expect(guests.every((g) => g.memberId !== null)).toBe(true)
  })

  it("writes one MemberAdded log and one Confirmed request per person", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const people = await Promise.all(
      ["Ana", "Ben", "Cara"].map((n) => seedGuestRegistrant(event.id, n))
    )

    await apply(
      people.map((p) => ({
        registrantId: p.registrantId,
        status: "confirmed" as const,
        groupId: group.id,
      }))
    )

    const logs = await db.smallGroupLog.findMany({
      where: { smallGroupId: group.id, action: "MemberAdded" },
      select: { memberId: true, description: true },
    })
    expect(logs).toHaveLength(3)
    expect(new Set(logs.map((l) => l.memberId)).size).toBe(3)
    expect(logs.every((l) => l.description?.includes("Catch Mech of Retreat"))).toBe(true)

    const requests = await db.smallGroupMemberRequest.findMany({
      where: { smallGroupId: group.id, status: "Confirmed" },
      select: { memberId: true },
    })
    expect(requests).toHaveLength(3)
    expect(requests.every((r) => r.memberId !== null)).toBe(true)
  })

  it("resolves a pre-existing pending request instead of creating a second one", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const { guestId, registrantId } = await seedGuestRegistrant(event.id, "Ana")
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: group.id, guestId, status: "Pending" },
    })

    await apply([{ registrantId, status: "confirmed", groupId: group.id }])

    const requests = await db.smallGroupMemberRequest.findMany({
      where: { smallGroupId: group.id },
      select: { status: true, memberId: true, guestId: true },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].status).toBe("Confirmed")
    expect(requests[0].guestId).toBeNull()
    expect(requests[0].memberId).not.toBeNull()
  })

  it("handles confirms, declines and pendings in a single mixed batch", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const yes = await seedGuestRegistrant(event.id, "Yes")
    const no = await seedGuestRegistrant(event.id, "No")
    const maybe = await seedGuestRegistrant(event.id, "Maybe")

    await apply([
      { registrantId: yes.registrantId, status: "confirmed", groupId: group.id },
      {
        registrantId: no.registrantId,
        status: "declined",
        declineReason: "NotInterested",
        groupId: group.id,
      },
      { registrantId: maybe.registrantId, status: "pending", groupId: null },
    ])

    // groupStatus filters out the seeded group leader, who is a Member too.
    const confirmed = await db.member.findMany({
      where: { groupStatus: "Member" },
      select: { firstName: true },
    })
    expect(confirmed.map((m) => m.firstName)).toEqual(["Yes"])

    const rejected = await db.smallGroupMemberRequest.findMany({
      where: { status: "Rejected" },
      select: { guestId: true, declineReason: true },
    })
    expect(rejected).toHaveLength(1)
    expect(rejected[0].guestId).toBe(no.guestId)
    expect(rejected[0].declineReason).toBe("NotInterested")

    // The deferred person is untouched — no member, no request, no log.
    const maybeGuest = await db.guest.findUniqueOrThrow({
      where: { id: maybe.guestId },
      select: { memberId: true },
    })
    expect(maybeGuest.memberId).toBeNull()
  })

  it("keeps each decline's own reason when a batch mixes several", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const a = await seedGuestRegistrant(event.id, "A")
    const b = await seedGuestRegistrant(event.id, "B")
    const c = await seedGuestRegistrant(event.id, "C")

    await apply([
      { registrantId: a.registrantId, status: "declined", declineReason: "NotInterested", groupId: group.id },
      { registrantId: b.registrantId, status: "declined", declineReason: "Unresponsive", groupId: group.id },
      { registrantId: c.registrantId, status: "declined", declineReason: "Others", reason: "moved away", groupId: group.id },
    ])

    const rows = await db.smallGroupMemberRequest.findMany({
      where: { status: "Rejected" },
      select: { guestId: true, declineReason: true, notes: true },
    })
    const byGuest = new Map(rows.map((r) => [r.guestId, r]))
    expect(byGuest.get(a.guestId)?.declineReason).toBe("NotInterested")
    expect(byGuest.get(b.guestId)?.declineReason).toBe("Unresponsive")
    expect(byGuest.get(c.guestId)?.declineReason).toBe("Others")
    expect(byGuest.get(c.guestId)?.notes).toBe("moved away")
  })

  it("carries each guest's schedule preference onto their own new member", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const ana = await seedGuestRegistrant(event.id, "Ana", {
      scheduleDayOfWeek: 2,
      scheduleTimeStart: "19:00",
    })
    const ben = await seedGuestRegistrant(event.id, "Ben", {
      scheduleDayOfWeek: 5,
      scheduleTimeStart: "07:30",
    })
    // No schedule at all — must not gain a phantom row from the batched insert.
    const cara = await seedGuestRegistrant(event.id, "Cara")

    await apply(
      [ana, ben, cara].map((p) => ({
        registrantId: p.registrantId,
        status: "confirmed" as const,
        groupId: group.id,
      }))
    )

    const prefs = await db.schedulePreference.findMany({
      select: { dayOfWeek: true, timeStart: true, member: { select: { firstName: true } } },
    })
    expect(prefs).toHaveLength(2)
    const byName = new Map(prefs.map((p) => [p.member.firstName, p]))
    expect(byName.get("Ana")).toMatchObject({ dayOfWeek: 2, timeStart: "19:00" })
    expect(byName.get("Ben")).toMatchObject({ dayOfWeek: 5, timeStart: "07:30" })
  })

  it("repoints family links for every promoted guest in the batch", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const dad = await seedGuestRegistrant(event.id, "Dad")
    const mom = await seedGuestRegistrant(event.id, "Mom")

    const family = await db.family.create({ data: { name: "Santos" }, select: { id: true } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, guestId: dad.guestId, role: "FatherHusband" },
        { familyId: family.id, guestId: mom.guestId, role: "MotherWife" },
      ],
    })

    await apply(
      [dad, mom].map((p) => ({
        registrantId: p.registrantId,
        status: "confirmed" as const,
        groupId: group.id,
      }))
    )

    const links = await db.familyMember.findMany({
      where: { familyId: family.id },
      select: { memberId: true, guestId: true, role: true },
    })
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.guestId === null)).toBe(true)
    expect(links.every((l) => l.memberId !== null)).toBe(true)
    expect(new Set(links.map((l) => l.memberId)).size).toBe(2)
    expect(links.map((l) => l.role).sort()).toEqual(["FatherHusband", "MotherWife"])
  })

  it("drops the guest's link when the target member is already in that family", async () => {
    const event = await seedEvent()
    const group = await seedGroup("Alpha")
    const { guestId, registrantId } = await seedGuestRegistrant(event.id, "Ana")

    const family = await db.family.create({ data: { name: "Santos" }, select: { id: true } })
    await db.familyMember.create({
      data: { familyId: family.id, guestId, role: "Child" },
    })

    await apply([{ registrantId, status: "confirmed", groupId: group.id }])

    // The promoted member inherits the single row; nothing is duplicated.
    const links = await db.familyMember.findMany({
      where: { familyId: family.id },
      select: { memberId: true, guestId: true, role: true },
    })
    expect(links).toHaveLength(1)
    expect(links[0].guestId).toBeNull()
    expect(links[0].role).toBe("Child")
  })

  it("places several existing members into their groups without touching others", async () => {
    const event = await seedEvent()
    const alpha = await seedGroup("Alpha")
    const beta = await seedGroup("Beta")

    const makeMember = async (firstName: string) => {
      const m = await db.member.create({
        data: { firstName, lastName: "M", dateJoined: new Date(), language: [] },
        select: { id: true },
      })
      const r = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: m.id },
        select: { id: true },
      })
      return { memberId: m.id, registrantId: r.id }
    }
    const one = await makeMember("One")
    const two = await makeMember("Two")
    const three = await makeMember("Three")

    await apply([
      { registrantId: one.registrantId, status: "confirmed", groupId: alpha.id },
      { registrantId: two.registrantId, status: "confirmed", groupId: alpha.id },
      { registrantId: three.registrantId, status: "confirmed", groupId: beta.id },
    ])

    const placed = await db.member.findMany({
      where: { id: { in: [one.memberId, two.memberId, three.memberId] } },
      select: { id: true, smallGroupId: true, groupStatus: true },
    })
    const byId = new Map(placed.map((m) => [m.id, m]))
    expect(byId.get(one.memberId)?.smallGroupId).toBe(alpha.id)
    expect(byId.get(two.memberId)?.smallGroupId).toBe(alpha.id)
    expect(byId.get(three.memberId)?.smallGroupId).toBe(beta.id)
    expect(placed.every((m) => m.groupStatus === "Member")).toBe(true)
  })

  it("never moves a member who already belongs to a group", async () => {
    const event = await seedEvent()
    const alpha = await seedGroup("Alpha")
    const beta = await seedGroup("Beta")

    const settled = await db.member.create({
      data: {
        firstName: "Settled",
        lastName: "M",
        dateJoined: new Date(),
        language: [],
        smallGroupId: beta.id,
        groupStatus: "Member",
      },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: settled.id },
      select: { id: true },
    })

    await apply([{ registrantId: registrant.id, status: "confirmed", groupId: alpha.id }])

    const after = await db.member.findUniqueOrThrow({
      where: { id: settled.id },
      select: { smallGroupId: true },
    })
    expect(after.smallGroupId).toBe(beta.id)
  })
})
