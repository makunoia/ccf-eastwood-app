/**
 * Characterization tests for the DB-aware matching layer (`lib/matching/index.ts`).
 *
 * These pin CURRENT behaviour — the eligibility gates, escalation levels and
 * exclusion rules that had no coverage at all. They exist so the scorer and
 * weight changes that follow can't silently reorder results.
 *
 * Anything asserted here is intentional behaviour, not incidental: if a later
 * change breaks one of these, that's a product decision to make explicitly.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  matchSmallGroups,
  matchSmallGroupsWithEscalation,
  matchCouplesGroups,
  matchBreakoutGroups,
} from "@/lib/matching"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroupSchedule", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest", "LifeStage", "MatchingWeightConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

let lifeStageSeq = 0
async function seedLifeStage(name?: string) {
  lifeStageSeq += 1
  return db.lifeStage.create({
    data: { name: name ?? `Stage ${lifeStageSeq}`, order: lifeStageSeq },
  })
}

type GroupOverrides = Partial<{
  name: string
  genderFocus: "Male" | "Female" | "Mixed"
  lifeStageIds: string[]
  scheduleDayOfWeek: number
  scheduleTimeStart: string
  scheduleTimeEnd: string
  memberLimit: number
  language: string[]
  locationCity: string
  groupType: "Regular" | "Couples"
  parentGroupId: string
  leaderId: string
}>

async function seedGroup(o: GroupOverrides = {}) {
  const { lifeStageIds, ...rest } = o
  return db.smallGroup.create({
    data: {
      name: rest.name ?? "Group",
      language: rest.language ?? [],
      ...(lifeStageIds?.length
        ? { lifeStages: { connect: lifeStageIds.map((id) => ({ id })) } }
        : {}),
      ...rest,
    },
  })
}

type PersonOverrides = Partial<{
  firstName: string
  gender: "Male" | "Female"
  lifeStageId: string
  language: string[]
  workCity: string
  workIndustry: string
  birthYear: number
  birthMonth: number
}>

async function seedGuest(o: PersonOverrides = {}) {
  return db.guest.create({
    data: {
      firstName: o.firstName ?? "Seeker",
      lastName: "Guest",
      language: o.language ?? [],
      gender: o.gender,
      lifeStageId: o.lifeStageId,
      workCity: o.workCity,
      workIndustry: o.workIndustry,
      birthYear: o.birthYear,
      birthMonth: o.birthMonth,
    },
  })
}

async function seedMember(o: PersonOverrides & { smallGroupId?: string } = {}) {
  return db.member.create({
    data: {
      firstName: o.firstName ?? "Seeker",
      lastName: "Member",
      dateJoined: new Date(),
      language: o.language ?? [],
      gender: o.gender,
      lifeStageId: o.lifeStageId,
      workCity: o.workCity,
      workIndustry: o.workIndustry,
      birthYear: o.birthYear,
      birthMonth: o.birthMonth,
      smallGroupId: o.smallGroupId,
    },
  })
}

const ids = (results: { groupId: string }[]) => results.map((r) => r.groupId)

// ─── matchSmallGroups — hard eligibility gates ────────────────────────────────

describe("matchSmallGroups — hard gates", () => {
  it("excludes a group whose gender focus conflicts with the candidate", async () => {
    const womens = await seedGroup({ name: "Women", genderFocus: "Female" })
    const mixed = await seedGroup({ name: "Mixed", genderFocus: "Mixed" })
    const guest = await seedGuest({ gender: "Male" })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(mixed.id)
    expect(ids(results)).not.toContain(womens.id)
  })

  it("keeps a gendered group when the candidate's gender is unknown", async () => {
    const womens = await seedGroup({ name: "Women", genderFocus: "Female" })
    const guest = await seedGuest({ gender: undefined })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(womens.id)
  })

  it("excludes a group whose life stage does not include the candidate's", async () => {
    const young = await seedLifeStage("Young Adults")
    const seniors = await seedLifeStage("Seniors")
    const youngGroup = await seedGroup({ name: "Young", lifeStageIds: [young.id] })
    const seniorGroup = await seedGroup({ name: "Senior", lifeStageIds: [seniors.id] })
    const guest = await seedGuest({ lifeStageId: young.id })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(youngGroup.id)
    expect(ids(results)).not.toContain(seniorGroup.id)
  })

  it("keeps a group that sets no life stage (accepts all)", async () => {
    const young = await seedLifeStage("Young Adults")
    const openGroup = await seedGroup({ name: "Open" })
    const guest = await seedGuest({ lifeStageId: young.id })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(openGroup.id)
  })

  it("excludes a group whose meeting time does not overlap the candidate's availability", async () => {
    const monday = await seedGroup({
      name: "Monday",
      scheduleDayOfWeek: 1,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })
    const tuesday = await seedGroup({
      name: "Tuesday",
      scheduleDayOfWeek: 2,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })
    const guest = await seedGuest()

    const results = await matchSmallGroups(
      { guestId: guest.id },
      { candidateScheduleSlot: { dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" } }
    )

    expect(ids(results)).toContain(tuesday.id)
    expect(ids(results)).not.toContain(monday.id)
  })

  it("excludes a group that is already at its member limit", async () => {
    const full = await seedGroup({ name: "Full", memberLimit: 1 })
    const open = await seedGroup({ name: "Open", memberLimit: 5 })
    await seedMember({ firstName: "Existing", smallGroupId: full.id })
    const guest = await seedGuest()

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(open.id)
    expect(ids(results)).not.toContain(full.id)
  })
})

// ─── matchSmallGroups — couples groups ────────────────────────────────────────

describe("matchSmallGroups — couples groups", () => {
  it("excludes couples groups from individual matching by default", async () => {
    const couples = await seedGroup({ name: "Couples", groupType: "Couples" })
    const regular = await seedGroup({ name: "Regular" })
    const guest = await seedGuest()

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).toContain(regular.id)
    expect(ids(results)).not.toContain(couples.id)
  })

  it("includes couples groups when the caller opts in", async () => {
    const couples = await seedGroup({ name: "Couples", groupType: "Couples" })
    const guest = await seedGuest()

    const results = await matchSmallGroups(
      { guestId: guest.id },
      { includeCouplesGroups: true }
    )

    expect(ids(results)).toContain(couples.id)
  })
})

// ─── matchSmallGroups — member exclusions ─────────────────────────────────────

describe("matchSmallGroups — member exclusions", () => {
  it("excludes the member's current group only when asked", async () => {
    const current = await seedGroup({ name: "Current" })
    const other = await seedGroup({ name: "Other" })
    const member = await seedMember({ smallGroupId: current.id })

    const withCurrent = await matchSmallGroups({ memberId: member.id })
    expect(ids(withCurrent)).toContain(current.id)

    const without = await matchSmallGroups(
      { memberId: member.id },
      { excludeCurrentGroup: true }
    )
    expect(ids(without)).not.toContain(current.id)
    expect(ids(without)).toContain(other.id)
  })

  it("never suggests a group the member leads", async () => {
    const member = await seedMember()
    const led = await seedGroup({ name: "Led", leaderId: member.id })
    const other = await seedGroup({ name: "Other" })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(ids(results)).not.toContain(led.id)
    expect(ids(results)).toContain(other.id)
  })

  it("never suggests a descendant of a group the member leads", async () => {
    const member = await seedMember()
    const led = await seedGroup({ name: "Led", leaderId: member.id })
    const child = await seedGroup({ name: "Child", parentGroupId: led.id })
    const grandchild = await seedGroup({ name: "Grandchild", parentGroupId: child.id })
    const unrelated = await seedGroup({ name: "Unrelated" })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(ids(results)).not.toContain(child.id)
    expect(ids(results)).not.toContain(grandchild.id)
    expect(ids(results)).toContain(unrelated.id)
  })

  it("never suggests a descendant of the member's current group", async () => {
    const current = await seedGroup({ name: "Current" })
    const child = await seedGroup({ name: "Child", parentGroupId: current.id })
    const unrelated = await seedGroup({ name: "Unrelated" })
    const member = await seedMember({ smallGroupId: current.id })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(ids(results)).not.toContain(child.id)
    expect(ids(results)).toContain(unrelated.id)
  })
})

// ─── matchSmallGroups — rejected requests ─────────────────────────────────────

describe("matchSmallGroups — rejected requests", () => {
  it("does not re-suggest a group that already rejected the guest", async () => {
    const rejected = await seedGroup({ name: "Rejected" })
    const open = await seedGroup({ name: "Open" })
    const guest = await seedGuest()
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: rejected.id, guestId: guest.id, status: "Rejected" },
    })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(ids(results)).not.toContain(rejected.id)
    expect(ids(results)).toContain(open.id)
  })

  it("does not re-suggest a group that already rejected the member", async () => {
    const rejected = await seedGroup({ name: "Rejected" })
    const member = await seedMember()
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: rejected.id, memberId: member.id, status: "Rejected" },
    })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(ids(results)).not.toContain(rejected.id)
  })

  it("still suggests a group whose earlier request is only Pending", async () => {
    const pending = await seedGroup({ name: "Pending" })
    const member = await seedMember()
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: pending.id, memberId: member.id, status: "Pending" },
    })

    const results = await matchSmallGroups({ memberId: member.id })

    expect(ids(results)).toContain(pending.id)
  })
})

// ─── matchSmallGroups — ranking & limit ───────────────────────────────────────

describe("matchSmallGroups — ranking", () => {
  it("returns results sorted by descending score", async () => {
    const stage = await seedLifeStage()
    await seedGroup({ name: "Strong", lifeStageIds: [stage.id], language: ["English"], locationCity: "Makati" })
    await seedGroup({ name: "Weak", language: ["Cebuano"], locationCity: "Cebu" })
    const guest = await seedGuest({
      lifeStageId: stage.id,
      language: ["English"],
      workCity: "Makati",
    })

    const results = await matchSmallGroups({ guestId: guest.id })

    expect(results.length).toBeGreaterThan(1)
    const scores = results.map((r) => r.totalScore)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it("caps results at the requested limit (default 10)", async () => {
    for (let i = 0; i < 12; i++) await seedGroup({ name: `Group ${i}` })
    const guest = await seedGuest()

    expect(await matchSmallGroups({ guestId: guest.id })).toHaveLength(10)
    expect(await matchSmallGroups({ guestId: guest.id }, { limit: 3 })).toHaveLength(3)
  })

  it("returns an empty list for a candidate that does not exist", async () => {
    await seedGroup()
    expect(await matchSmallGroups({ guestId: "does-not-exist" })).toEqual([])
    expect(await matchSmallGroups({ memberId: "does-not-exist" })).toEqual([])
  })

  it("attaches a groupSummary with life-stage names and industry peer count, not a roster", async () => {
    const stage = await seedLifeStage("Young Adults")
    const group = await seedGroup({
      name: "Summary",
      lifeStageIds: [stage.id],
      memberLimit: 8,
    })
    await seedMember({ firstName: "Peer1", workIndustry: "Tech", smallGroupId: group.id })
    await seedMember({ firstName: "Peer2", workIndustry: "Tech", smallGroupId: group.id })
    await seedMember({ firstName: "Other", workIndustry: "Finance", smallGroupId: group.id })
    const guest = await seedGuest({ lifeStageId: stage.id, workIndustry: "Tech" })

    const [result] = await matchSmallGroups({ guestId: guest.id })

    expect(result.groupSummary.lifeStageNames).toEqual(["Young Adults"])
    expect(result.groupSummary.industryPeerCount).toBe(2)
    expect(result.groupSummary.currentCount).toBe(3)
    expect(result.groupSummary.memberLimit).toBe(8)
    // No member roster / industries array leaks through the summary
    expect(result.groupSummary).not.toHaveProperty("memberIndustries")
    expect(result.groupSummary).not.toHaveProperty("members")
  })
})

// ─── matchCouplesGroups ───────────────────────────────────────────────────────

describe("matchCouplesGroups", () => {
  it("returns nothing when both ids are the same member", async () => {
    await seedGroup({ name: "Couples", groupType: "Couples" })
    const m = await seedMember()

    expect(await matchCouplesGroups({ memberIdA: m.id, memberIdB: m.id })).toEqual([])
  })

  it("only considers Couples groups", async () => {
    const couples = await seedGroup({ name: "Couples", groupType: "Couples" })
    const regular = await seedGroup({ name: "Regular" })
    const a = await seedMember({ firstName: "A" })
    const b = await seedMember({ firstName: "B" })

    const results = await matchCouplesGroups({ memberIdA: a.id, memberIdB: b.id })

    expect(ids(results)).toContain(couples.id)
    expect(ids(results)).not.toContain(regular.id)
  })

  it("requires two free seats, not one", async () => {
    const oneSeat = await seedGroup({ name: "OneSeat", groupType: "Couples", memberLimit: 3 })
    const twoSeats = await seedGroup({ name: "TwoSeats", groupType: "Couples", memberLimit: 4 })
    await seedMember({ firstName: "X", smallGroupId: oneSeat.id })
    await seedMember({ firstName: "Y", smallGroupId: oneSeat.id })
    await seedMember({ firstName: "Z", smallGroupId: twoSeats.id })
    await seedMember({ firstName: "W", smallGroupId: twoSeats.id })
    const a = await seedMember({ firstName: "A" })
    const b = await seedMember({ firstName: "B" })

    const results = await matchCouplesGroups({ memberIdA: a.id, memberIdB: b.id })

    expect(ids(results)).toContain(twoSeats.id)
    expect(ids(results)).not.toContain(oneSeat.id)
  })

  it("excludes a group either spouse already belongs to", async () => {
    const hers = await seedGroup({ name: "Hers", groupType: "Couples" })
    const other = await seedGroup({ name: "Other", groupType: "Couples" })
    const a = await seedMember({ firstName: "A", smallGroupId: hers.id })
    const b = await seedMember({ firstName: "B" })

    const results = await matchCouplesGroups({ memberIdA: a.id, memberIdB: b.id })

    expect(ids(results)).not.toContain(hers.id)
    expect(ids(results)).toContain(other.id)
  })

  it("excludes a couples group whose gender focus conflicts with a spouse", async () => {
    // Consistency with the individual paths: a misconfigured single-gender
    // couples group must not be suggested to a mixed-gender pair.
    const womensCouples = await seedGroup({
      name: "Women only",
      groupType: "Couples",
      genderFocus: "Female",
    })
    const mixed = await seedGroup({ name: "Mixed", groupType: "Couples", genderFocus: "Mixed" })
    const husband = await seedMember({ firstName: "H", gender: "Male" })
    const wife = await seedMember({ firstName: "W", gender: "Female" })

    const results = await matchCouplesGroups({ memberIdA: husband.id, memberIdB: wife.id })

    expect(ids(results)).toContain(mixed.id)
    expect(ids(results)).not.toContain(womensCouples.id)
  })

  it("ranks by the worse spouse's score, not the average", async () => {
    const stage = await seedLifeStage()
    // Fits A perfectly, B not at all on language/location
    const lopsided = await seedGroup({
      name: "Lopsided",
      groupType: "Couples",
      language: ["English"],
      locationCity: "Makati",
    })
    // Fits both moderately
    const even = await seedGroup({
      name: "Even",
      groupType: "Couples",
      language: ["English", "Tagalog"],
      locationCity: "Makati",
    })
    const a = await seedMember({
      firstName: "A",
      lifeStageId: stage.id,
      language: ["English"],
      workCity: "Makati",
    })
    const b = await seedMember({
      firstName: "B",
      lifeStageId: stage.id,
      language: ["Tagalog"],
      workCity: "Makati",
    })

    const results = await matchCouplesGroups({ memberIdA: a.id, memberIdB: b.id })
    const top = results[0]

    expect(top.groupId).toBe(even.id)
    expect(top.combinedScore).toBe(Math.min(top.resultA.totalScore, top.resultB.totalScore))
    expect(ids(results)).toContain(lopsided.id)
  })
})

// ─── matchSmallGroupsWithEscalation ───────────────────────────────────────────
//
// Cooldown behaviour for this path is already covered in
// tests/unit/matching-guest-cooldown.test.ts — not duplicated here.

/**
 * Builds an event with two volunteers: one facilitates the guest's breakout
 * group (level 1), one does not (level 2). Each leads their own small group.
 */
async function seedEscalationScenario() {
  const event = await db.event.create({
    data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })

  const faciMember = await seedMember({ firstName: "Faci" })
  const otherMember = await seedMember({ firstName: "Other" })

  const faciGroup = await seedGroup({ name: "Faci's group", leaderId: faciMember.id })
  const otherGroup = await seedGroup({ name: "Other volunteer's group", leaderId: otherMember.id })
  const unrelatedGroup = await seedGroup({ name: "Unrelated group" })

  const faciVol = await db.volunteer.create({
    data: {
      memberId: faciMember.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })
  await db.volunteer.create({
    data: {
      memberId: otherMember.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
    },
  })

  const breakout = await db.breakoutGroup.create({
    data: { name: "Breakout", eventId: event.id, facilitatorId: faciVol.id },
  })

  const guest = await seedGuest()
  const registrant = await db.eventRegistrant.create({
    data: { eventId: event.id, guestId: guest.id },
  })
  await db.breakoutGroupMember.create({
    data: { breakoutGroupId: breakout.id, registrantId: registrant.id },
  })

  return { event, guest, faciGroup, otherGroup, unrelatedGroup, breakout, registrant }
}

describe("matchSmallGroupsWithEscalation", () => {
  it("sorts groups into the three escalation levels", async () => {
    const { event, guest, faciGroup, otherGroup, unrelatedGroup } =
      await seedEscalationScenario()

    const levels = await matchSmallGroupsWithEscalation(guest.id, event.id)

    const byLevel = Object.fromEntries(levels.map((l) => [l.level, l]))

    expect(byLevel[1].source).toBe("breakout-facilitator")
    expect(ids(byLevel[1].matches)).toEqual([faciGroup.id])

    expect(byLevel[2].source).toBe("event-volunteer")
    expect(ids(byLevel[2].matches)).toEqual([otherGroup.id])

    expect(byLevel[3].source).toBe("all-small-groups")
    expect(ids(byLevel[3].matches)).toContain(unrelatedGroup.id)
    expect(ids(byLevel[3].matches)).not.toContain(faciGroup.id)
    expect(ids(byLevel[3].matches)).not.toContain(otherGroup.id)
  })

  it("omits levels that have no groups", async () => {
    const event = await db.event.create({
      data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    await seedGroup({ name: "Only group" })
    const guest = await seedGuest()

    const levels = await matchSmallGroupsWithEscalation(guest.id, event.id)

    // No breakout membership and no volunteers → only level 3 exists
    expect(levels.map((l) => l.level)).toEqual([3])
  })

  it("caps level 3 at 10 groups", async () => {
    const event = await db.event.create({
      data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    for (let i = 0; i < 14; i++) await seedGroup({ name: `Group ${i}` })
    const guest = await seedGuest()

    const levels = await matchSmallGroupsWithEscalation(guest.id, event.id)

    expect(levels[0].matches).toHaveLength(10)
  })

  it("excludes couples groups, full groups and rejected groups from every level", async () => {
    const { event, guest, unrelatedGroup } = await seedEscalationScenario()
    const couples = await seedGroup({ name: "Couples", groupType: "Couples" })
    const full = await seedGroup({ name: "Full", memberLimit: 1 })
    await seedMember({ firstName: "Occupant", smallGroupId: full.id })
    const rejected = await seedGroup({ name: "Rejected" })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: rejected.id, guestId: guest.id, status: "Rejected" },
    })

    const levels = await matchSmallGroupsWithEscalation(guest.id, event.id)
    const all = levels.flatMap((l) => ids(l.matches))

    expect(all).toContain(unrelatedGroup.id)
    expect(all).not.toContain(couples.id)
    expect(all).not.toContain(full.id)
    expect(all).not.toContain(rejected.id)
  })

  it("applies the caller's schedule slot as a hard gate across levels", async () => {
    const { event, guest, faciGroup } = await seedEscalationScenario()
    await db.smallGroup.update({
      where: { id: faciGroup.id },
      data: {
        scheduleDayOfWeek: 1,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      },
    })

    const levels = await matchSmallGroupsWithEscalation(guest.id, event.id, {
      dayOfWeek: 3,
      timeStart: "19:00",
      timeEnd: "21:00",
    })
    const all = levels.flatMap((l) => ids(l.matches))

    expect(all).not.toContain(faciGroup.id)
  })

  it("returns an empty list for a guest that does not exist", async () => {
    const event = await db.event.create({
      data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    await seedGroup()

    expect(await matchSmallGroupsWithEscalation("nope", event.id)).toEqual([])
  })
})

// ─── matchBreakoutGroups ──────────────────────────────────────────────────────

async function seedEventWithBreakout(opts: {
  facilitatorGender?: "Male" | "Female"
  groupGenderFocus?: "Male" | "Female" | "Mixed"
  linkedGroupGenderFocus?: "Male" | "Female" | "Mixed"
} = {}) {
  const event = await db.event.create({
    data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })

  let facilitatorId: string | undefined
  if (opts.facilitatorGender) {
    const faciMember = await seedMember({ firstName: "Faci", gender: opts.facilitatorGender })
    const vol = await db.volunteer.create({
      data: {
        memberId: faciMember.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })
    facilitatorId = vol.id
  }

  let linkedSmallGroupId: string | undefined
  if (opts.linkedGroupGenderFocus) {
    const linked = await seedGroup({
      name: "Linked",
      genderFocus: opts.linkedGroupGenderFocus,
    })
    linkedSmallGroupId = linked.id
  }

  const breakout = await db.breakoutGroup.create({
    data: {
      name: "Breakout",
      eventId: event.id,
      genderFocus: opts.groupGenderFocus,
      facilitatorId,
      linkedSmallGroupId,
    },
  })

  return { event, committee, role, breakout }
}

describe("matchBreakoutGroups — effective gender focus", () => {
  it("uses the group's explicit gender focus when set", async () => {
    const { event, breakout } = await seedEventWithBreakout({
      groupGenderFocus: "Female",
      facilitatorGender: "Male",
    })
    // Control group — proves the exclusion below isn't just an empty result
    const control = await db.breakoutGroup.create({
      data: { name: "Control", eventId: event.id },
    })
    const guest = await seedGuest({ gender: "Male" })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const results = await matchBreakoutGroups(registrant.id, event.id)

    // Explicit Female focus beats the male facilitator → male candidate excluded
    expect(ids(results)).toContain(control.id)
    expect(ids(results)).not.toContain(breakout.id)
  })

  it("infers gender focus from the facilitator when the group sets none", async () => {
    const { event, breakout } = await seedEventWithBreakout({ facilitatorGender: "Female" })
    const male = await seedGuest({ firstName: "Male", gender: "Male" })
    const female = await seedGuest({ firstName: "Female", gender: "Female" })
    const maleReg = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: male.id },
    })
    const femaleReg = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: female.id },
    })

    expect(ids(await matchBreakoutGroups(maleReg.id, event.id))).not.toContain(breakout.id)
    expect(ids(await matchBreakoutGroups(femaleReg.id, event.id))).toContain(breakout.id)
  })

  it("falls back to the linked small group's focus when facilitator gender is unknown", async () => {
    const { event, breakout } = await seedEventWithBreakout({
      linkedGroupGenderFocus: "Female",
    })
    // Control group — proves the exclusion below isn't just an empty result
    const control = await db.breakoutGroup.create({
      data: { name: "Control", eventId: event.id },
    })
    const guest = await seedGuest({ gender: "Male" })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const results = await matchBreakoutGroups(registrant.id, event.id)
    expect(ids(results)).toContain(control.id)
    expect(ids(results)).not.toContain(breakout.id)
  })
})

describe("matchBreakoutGroups — assignment", () => {
  it("excludes groups the registrant is already in when asked", async () => {
    const { event, breakout } = await seedEventWithBreakout()
    const guest = await seedGuest()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: breakout.id, registrantId: registrant.id },
    })

    const withAssigned = await matchBreakoutGroups(registrant.id, event.id)
    expect(ids(withAssigned)).toContain(breakout.id)

    const without = await matchBreakoutGroups(registrant.id, event.id, {
      excludeAssigned: true,
    })
    expect(ids(without)).not.toContain(breakout.id)
  })

  it("only considers breakout groups belonging to the given event", async () => {
    const { event: eventA, breakout: breakoutA } = await seedEventWithBreakout()
    const { breakout: breakoutB } = await seedEventWithBreakout()
    const guest = await seedGuest()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: eventA.id, guestId: guest.id },
    })

    const results = await matchBreakoutGroups(registrant.id, eventA.id)

    expect(ids(results)).toContain(breakoutA.id)
    expect(ids(results)).not.toContain(breakoutB.id)
  })

  it("scores a registrant with neither member nor guest via the empty profile", async () => {
    const { event, breakout } = await seedEventWithBreakout()
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walk", lastName: "In" },
    })

    const results = await matchBreakoutGroups(registrant.id, event.id)

    expect(ids(results)).toContain(breakout.id)
  })
})
