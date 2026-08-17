import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import {
  addRegistrantsToBreakout,
  autoAssignRegistrantToBreakout,
  getRegistrantBreakoutGroupName,
  setFacilitator,
} from "@/app/(dashboard)/events/breakout-actions"
import {
  carryOverBreakoutGroups,
  registerForCluster,
} from "@/app/(dashboard)/events/cluster-actions"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
import { resolvePoolScope } from "@/lib/events/pool-scope"

/**
 * Collab clusters (CCF-148): two ministries co-running one event.
 *
 * The suite is organised around the four things that were structurally impossible
 * before and the two bugs the change fixes.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "EventCluster", "EventClusterEvent", "Event", "EventRegistrant", "BreakoutGroup", "BreakoutGroupMember", "Volunteer", "VolunteerCommittee", "CommitteeRole", "Member", "Guest", "LifeStage", "EventModule", "SmallGroup", "SmallGroupMemberRequest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const DAY = new Date("2026-09-05T00:00:00.000Z")

async function seedDay(kind: "Parallel" | "Collab") {
  const cluster = await db.eventCluster.create({
    data: { name: "Youth × Singles Night", date: DAY, kind },
    select: { id: true },
  })
  const youth = await db.event.create({
    data: { name: "Youth Night", type: "OneTime", startDate: DAY, endDate: DAY },
    select: { id: true },
  })
  const singles = await db.event.create({
    data: { name: "Singles Connect", type: "OneTime", startDate: DAY, endDate: DAY },
    select: { id: true },
  })
  await db.eventClusterEvent.createMany({
    data: [
      { clusterId: cluster.id, eventId: youth.id, order: 0 },
      { clusterId: cluster.id, eventId: singles.id, order: 1 },
    ],
  })
  // Breakout placement is module-gated (CCF-128) on every write path.
  await db.eventModule.createMany({
    data: [
      { eventId: youth.id, type: "Breakout" },
      { eventId: singles.id, type: "Breakout" },
    ],
  })
  return { clusterId: cluster.id, youthId: youth.id, singlesId: singles.id }
}

async function seedMember(firstName: string) {
  return db.member.create({
    data: { firstName, lastName: "Cruz", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
}

async function seedRegistrant(eventId: string, memberId: string) {
  return db.eventRegistrant.create({
    data: { eventId, memberId },
    select: { id: true },
  })
}

async function seedVolunteer(eventId: string, memberId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId },
    select: { id: true },
  })
  const role = await db.committeeRole.create({
    data: { name: "Table host", committeeId: committee.id },
    select: { id: true },
  })
  return db.volunteer.create({
    data: {
      memberId,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
    select: { id: true },
  })
}

// ─── The owner seam ──────────────────────────────────────────────────────────

describe("pool scope resolution", () => {
  it("gives a Collab event the cluster as its breakout owner", async () => {
    const { clusterId, youthId, singlesId } = await seedDay("Collab")
    const scope = await resolvePoolScope(youthId)
    expect(scope.breakoutOwner).toEqual({ clusterId })
    expect(scope.candidateEventIds.sort()).toEqual([youthId, singlesId].sort())
  })

  it("leaves a Parallel event exactly as an unclustered one", async () => {
    const { youthId } = await seedDay("Parallel")
    const scope = await resolvePoolScope(youthId)
    expect(scope.breakoutOwner).toEqual({ eventId: youthId })
    expect(scope.candidateEventIds).toEqual([youthId])
  })
})

// ─── Cross-event seating ─────────────────────────────────────────────────────

describe("cluster-owned tables seat either ministry's registrants", () => {
  it("accepts a registrant from each member event into one cluster table", async () => {
    const { clusterId, youthId, singlesId } = await seedDay("Collab")
    const table = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })

    const josh = await seedMember("Josh")
    const maria = await seedMember("Maria")
    const joshReg = await seedRegistrant(youthId, josh.id)
    const mariaReg = await seedRegistrant(singlesId, maria.id)

    const result = await addRegistrantsToBreakout(
      table.id,
      [joshReg.id, mariaReg.id],
      { clusterId }
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.added).toBe(2)

    const seats = await db.breakoutGroupMember.count({
      where: { breakoutGroupId: table.id },
    })
    expect(seats).toBe(2)
  })

  it("refuses a registrant from outside the day", async () => {
    const { clusterId } = await seedDay("Collab")
    const other = await db.event.create({
      data: { name: "Unrelated", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    const table = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })
    const outsider = await seedMember("Outsider")
    const reg = await seedRegistrant(other.id, outsider.id)

    const result = await addRegistrantsToBreakout(table.id, [reg.id], { clusterId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.added).toBe(0)
      expect(result.data.failed[0].reason).toContain("event day")
    }
  })

  it("keeps an event-owned table refusing the partner event's registrant", async () => {
    const { youthId, singlesId } = await seedDay("Collab")
    const standing = await db.breakoutGroup.create({
      data: { eventId: youthId, name: "Youth Cell A" },
      select: { id: true },
    })
    const maria = await seedMember("Maria")
    const mariaReg = await seedRegistrant(singlesId, maria.id)

    const result = await addRegistrantsToBreakout(standing.id, [mariaReg.id], {
      eventId: youthId,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.added).toBe(0)
  })
})

// ─── The recurring-registrant finding ────────────────────────────────────────

describe("a standing placement does not block the day's table", () => {
  it("keeps a member already seated in their ministry's own group eligible", async () => {
    const { clusterId, youthId } = await seedDay("Collab")

    // A Youth regular: one long-lived registrant row, already seated in Youth's
    // standing table. Under a global `breakoutGroupMemberships: { none: {} }` this
    // person — and every regular like them — would be invisible to the collab.
    const regular = await seedMember("Regular")
    const reg = await seedRegistrant(youthId, regular.id)
    const standing = await db.breakoutGroup.create({
      data: { eventId: youthId, name: "Youth Cell A" },
      select: { id: true },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: standing.id, registrantId: reg.id },
    })

    const eligible = await db.eventRegistrant.findMany({
      where: { eventId: youthId, ...unassignedCandidateWhere({ clusterId }) },
      select: { id: true },
    })
    expect(eligible.map((e) => e.id)).toContain(reg.id)

    // …and the event's own page still sees them as taken.
    const forEvent = await db.eventRegistrant.findMany({
      where: { eventId: youthId, ...unassignedCandidateWhere({ eventId: youthId }) },
      select: { id: true },
    })
    expect(forEvent.map((e) => e.id)).not.toContain(reg.id)
  })
})

// ─── One seat per person ─────────────────────────────────────────────────────

describe("one seat per person across the day", () => {
  it("refuses a second registrant row for someone already seated", async () => {
    const { clusterId, youthId, singlesId } = await seedDay("Collab")
    const table1 = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })
    const table2 = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 2" },
      select: { id: true },
    })

    // A Collab registers one person to every member event, so Maria has two rows.
    const maria = await seedMember("Maria")
    const rowA = await seedRegistrant(youthId, maria.id)
    const rowB = await seedRegistrant(singlesId, maria.id)

    const first = await addRegistrantsToBreakout(table1.id, [rowA.id], { clusterId })
    expect(first.success).toBe(true)

    const second = await addRegistrantsToBreakout(table2.id, [rowB.id], { clusterId })
    expect(second.success).toBe(true)
    if (second.success) {
      expect(second.data.added).toBe(0)
      expect(second.data.failed[0].reason).toContain("already in a breakout group")
    }
  })

  it("auto-assign on check-in does not seat the same person twice", async () => {
    const { clusterId, youthId, singlesId } = await seedDay("Collab")
    await db.breakoutGroup.createMany({
      data: [
        { clusterId, name: "Table 1" },
        { clusterId, name: "Table 2" },
      ],
    })
    // Auto-assign only runs when the event asks for it.
    await db.event.updateMany({
      where: { id: { in: [youthId, singlesId] } },
      data: { autoAssignBreakout: true },
    })

    const maria = await seedMember("Maria")
    const rowA = await seedRegistrant(youthId, maria.id)
    const rowB = await seedRegistrant(singlesId, maria.id)

    // Check-in fires this per registrant row.
    await autoAssignRegistrantToBreakout(rowA.id, youthId)
    await autoAssignRegistrantToBreakout(rowB.id, singlesId)

    const seats = await db.breakoutGroupMember.count({
      where: { breakoutGroup: { clusterId } },
    })
    expect(seats).toBe(1)
  })
})

// ─── The check-in success screen ─────────────────────────────────────────────

describe("getRegistrantBreakoutGroupName", () => {
  it("finds a cluster-owned table for a member event's registrant", async () => {
    const { clusterId, youthId } = await seedDay("Collab")
    const table = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 7" },
      select: { id: true },
    })
    const josh = await seedMember("Josh")
    const reg = await seedRegistrant(youthId, josh.id)
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: table.id, registrantId: reg.id },
    })

    // Previously scoped `breakoutGroup: { eventId }`, so a cluster-owned table
    // matched nothing and the public success screen said "no group".
    await expect(getRegistrantBreakoutGroupName(reg.id, youthId)).resolves.toEqual({
      name: "Table 7",
    })
  })
})

// ─── The volunteer union ─────────────────────────────────────────────────────

describe("volunteers pool as a union", () => {
  it("lets the partner ministry's volunteer run one of the day's tables", async () => {
    const { clusterId, singlesId } = await seedDay("Collab")
    const table = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })
    const ana = await seedMember("Ana")
    const volunteer = await seedVolunteer(singlesId, ana.id)

    const result = await setFacilitator(table.id, volunteer.id, "facilitator", {
      clusterId,
    })
    expect(result.success).toBe(true)

    const saved = await db.breakoutGroup.findUnique({
      where: { id: table.id },
      select: { facilitatorId: true },
    })
    expect(saved?.facilitatorId).toBe(volunteer.id)
  })

  it("still refuses a volunteer from outside the day", async () => {
    const { clusterId } = await seedDay("Collab")
    const other = await db.event.create({
      data: { name: "Unrelated", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    const table = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })
    const stranger = await seedMember("Stranger")
    const volunteer = await seedVolunteer(other.id, stranger.id)

    const result = await setFacilitator(table.id, volunteer.id, "facilitator", {
      clusterId,
    })
    expect(result.success).toBe(false)
  })

  it("keeps an event-owned table refusing the partner's volunteer", async () => {
    const { youthId, singlesId } = await seedDay("Collab")
    const standing = await db.breakoutGroup.create({
      data: { eventId: youthId, name: "Youth Cell A" },
      select: { id: true },
    })
    const ana = await seedMember("Ana")
    const volunteer = await seedVolunteer(singlesId, ana.id)

    const result = await setFacilitator(standing.id, volunteer.id, "facilitator", {
      eventId: youthId,
    })
    expect(result.success).toBe(false)
  })
})

// ─── Carry-over ──────────────────────────────────────────────────────────────

describe("carryOverBreakoutGroups", () => {
  it("copies definitions, facilitators and schedules without members by default", async () => {
    const { clusterId, youthId } = await seedDay("Collab")
    const lifeStage = await db.lifeStage.create({
      data: { name: "Youth", order: 1 },
      select: { id: true },
    })
    const ana = await seedMember("Ana")
    const volunteer = await seedVolunteer(youthId, ana.id)
    const source = await db.breakoutGroup.create({
      data: {
        eventId: youthId,
        name: "Cell A",
        facilitatorId: volunteer.id,
        memberLimit: 8,
        genderFocus: "Mixed",
        language: ["English"],
        locationCity: "Pasig",
        lifeStages: { connect: [{ id: lifeStage.id }] },
        schedules: { create: [{ dayOfWeek: 6, timeStart: "18:00", timeEnd: "20:00" }] },
      },
      select: { id: true },
    })
    // Somebody already sitting in the source group.
    const josh = await seedMember("Josh")
    const joshReg = await seedRegistrant(youthId, josh.id)
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: source.id, registrantId: joshReg.id },
    })

    const result = await carryOverBreakoutGroups(clusterId, youthId, {
      includeMembers: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(1)
      expect(result.data.membersCopied).toBe(0)
    }

    const copy = await db.breakoutGroup.findFirst({
      where: { clusterId },
      include: { lifeStages: true, schedules: true, _count: { select: { members: true } } },
    })
    expect(copy?.name).toBe("Cell A")
    expect(copy?.facilitatorId).toBe(volunteer.id)
    expect(copy?.memberLimit).toBe(8)
    expect(copy?.locationCity).toBe("Pasig")
    expect(copy?.lifeStages.map((l) => l.id)).toEqual([lifeStage.id])
    expect(copy?.schedules).toHaveLength(1)
    expect(copy?._count.members).toBe(0)

    // The source is untouched — a copy, never a move.
    const srcAfter = await db.breakoutGroup.findUnique({
      where: { id: source.id },
      select: { eventId: true, _count: { select: { members: true } } },
    })
    expect(srcAfter?.eventId).toBe(youthId)
    expect(srcAfter?._count.members).toBe(1)
  })

  it("copies members when asked, and skips anyone already seated on the day", async () => {
    const { clusterId, youthId } = await seedDay("Collab")
    const source = await db.breakoutGroup.create({
      data: { eventId: youthId, name: "Cell A" },
      select: { id: true },
    })
    const josh = await seedMember("Josh")
    const maria = await seedMember("Maria")
    const joshReg = await seedRegistrant(youthId, josh.id)
    const mariaReg = await seedRegistrant(youthId, maria.id)
    await db.breakoutGroupMember.createMany({
      data: [
        { breakoutGroupId: source.id, registrantId: joshReg.id },
        { breakoutGroupId: source.id, registrantId: mariaReg.id },
      ],
    })
    // Maria is already at one of the day's tables.
    const existing = await db.breakoutGroup.create({
      data: { clusterId, name: "Table 1" },
      select: { id: true },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: existing.id, registrantId: mariaReg.id },
    })

    const result = await carryOverBreakoutGroups(clusterId, youthId, {
      includeMembers: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.membersCopied).toBe(1)
      expect(result.data.membersSkipped).toBe(1)
    }
  })

  it("suffixes a name that already exists on the day", async () => {
    const { clusterId, youthId } = await seedDay("Collab")
    await db.breakoutGroup.create({ data: { clusterId, name: "Cell A" } })
    await db.breakoutGroup.create({ data: { eventId: youthId, name: "Cell A" } })

    const result = await carryOverBreakoutGroups(clusterId, youthId, {
      includeMembers: false,
    })
    expect(result.success).toBe(true)

    const names = (
      await db.breakoutGroup.findMany({ where: { clusterId }, select: { name: true } })
    ).map((g) => g.name)
    expect(names.sort()).toEqual(["Cell A", "Cell A (2)"])
  })

  it("refuses an event outside the cluster", async () => {
    const { clusterId } = await seedDay("Collab")
    const other = await db.event.create({
      data: { name: "Unrelated", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    await db.breakoutGroup.create({ data: { eventId: other.id, name: "Cell A" } })

    const result = await carryOverBreakoutGroups(clusterId, other.id, {
      includeMembers: false,
    })
    expect(result.success).toBe(false)
  })

  it("refuses a Parallel day — it has no tables of its own", async () => {
    const { clusterId, youthId } = await seedDay("Parallel")
    await db.breakoutGroup.create({ data: { eventId: youthId, name: "Cell A" } })

    const result = await carryOverBreakoutGroups(clusterId, youthId, {
      includeMembers: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("collab")
  })

  it("honours the source group's member limit", async () => {
    const { clusterId, youthId } = await seedDay("Collab")
    const source = await db.breakoutGroup.create({
      data: { eventId: youthId, name: "Cell A", memberLimit: 1 },
      select: { id: true },
    })
    for (const name of ["A", "B", "C"]) {
      const m = await seedMember(name)
      const r = await seedRegistrant(youthId, m.id)
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: source.id, registrantId: r.id },
      })
    }

    const result = await carryOverBreakoutGroups(clusterId, youthId, {
      includeMembers: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.membersCopied).toBe(1)
      expect(result.data.membersSkipped).toBe(2)
    }
  })
})

// ─── The fan-out ─────────────────────────────────────────────────────────────

describe("registerForCluster on a Collab day", () => {
  async function openDay(kind: "Parallel" | "Collab") {
    const cluster = await db.eventCluster.create({
      data: {
        name: "Youth × Singles Night",
        date: DAY,
        kind,
        isOpen: true,
        publicToken: `tok-${kind.toLowerCase()}`,
      },
      select: { id: true, publicToken: true },
    })
    const youth = await db.event.create({
      data: { name: "Youth Night", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    const singles = await db.event.create({
      data: { name: "Singles Connect", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    await db.eventClusterEvent.createMany({
      data: [
        { clusterId: cluster.id, eventId: youth.id, order: 0 },
        { clusterId: cluster.id, eventId: singles.id, order: 1 },
      ],
    })
    await db.eventModule.createMany({
      data: [
        { eventId: youth.id, type: "Breakout" },
        { eventId: singles.id, type: "Breakout" },
      ],
    })
    return { ...cluster, youthId: youth.id, singlesId: singles.id }
  }

  const payload = {
    firstName: "Maria",
    lastName: "Cruz",
    mobileNumber: "0917 111 2222",
  }

  it("registers the person to every member event without being asked", async () => {
    const day = await openDay("Collab")

    // Note the empty selection: the form never showed a picker.
    const result = await registerForCluster(
      day.publicToken,
      payload,
      null,
      null,
      undefined,
      []
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.results).toHaveLength(2)
      expect(result.data.results.every((r) => r.status === "registered")).toBe(true)
    }

    const rows = await db.eventRegistrant.findMany({ select: { eventId: true } })
    expect(rows.map((r) => r.eventId).sort()).toEqual(
      [day.youthId, day.singlesId].sort()
    )
  })

  it("ignores a payload naming only one of the day's events", async () => {
    const day = await openDay("Collab")

    // A crafted request claiming to register for one ministry's half only.
    const result = await registerForCluster(
      day.publicToken,
      payload,
      null,
      null,
      undefined,
      [day.youthId]
    )
    expect(result.success).toBe(true)

    const count = await db.eventRegistrant.count()
    expect(count).toBe(2)
  })

  it("seats the person at ONE table and files ONE seeker request", async () => {
    const day = await openDay("Collab")
    // `wantsSmallGroup` is stripped by `sanitizeRegistrantPayload` unless the
    // day's shared form actually collects it — the config is the authority on
    // what a submission may claim.
    await db.eventFormConfig.create({
      data: { clusterId: day.id, context: "Register", sectionSmallGroup: true },
    })
    await db.breakoutGroup.createMany({
      data: [
        { clusterId: day.id, name: "Table 1" },
        { clusterId: day.id, name: "Table 2" },
      ],
    })
    await db.event.updateMany({
      where: { id: { in: [day.youthId, day.singlesId] } },
      data: { autoAssignBreakout: true },
    })

    const result = await registerForCluster(
      day.publicToken,
      { ...payload, wantsSmallGroup: true },
      null,
      null,
      undefined,
      []
    )
    expect(result.success).toBe(true)

    // Two registrations, but breakout placement and the DGroup request are
    // per-person facts — the fan-out runs each exactly once.
    expect(await db.eventRegistrant.count()).toBe(2)
    expect(await db.breakoutGroupMember.count()).toBe(1)
    expect(await db.smallGroupMemberRequest.count()).toBe(1)
  })

  it("still honours the picker on a Parallel day", async () => {
    const day = await openDay("Parallel")

    const result = await registerForCluster(
      day.publicToken,
      payload,
      null,
      null,
      undefined,
      [day.youthId]
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.results).toHaveLength(1)

    const rows = await db.eventRegistrant.findMany({ select: { eventId: true } })
    expect(rows.map((r) => r.eventId)).toEqual([day.youthId])
  })

  it("registers what it can when one event's window is closed", async () => {
    const day = await openDay("Collab")
    // Singles closed its own registration yesterday.
    await db.event.update({
      where: { id: day.singlesId },
      data: {
        registrationStart: new Date("2026-08-01T00:00:00.000Z"),
        registrationEnd: new Date("2026-08-02T00:00:00.000Z"),
      },
    })

    const result = await registerForCluster(
      day.publicToken,
      payload,
      null,
      null,
      undefined,
      []
    )
    expect(result.success).toBe(true)
    if (result.success) {
      const byEvent = new Map(result.data.results.map((r) => [r.eventId, r.status]))
      expect(byEvent.get(day.youthId)).toBe("registered")
      expect(byEvent.get(day.singlesId)).toBe("closed")
    }
    expect(await db.eventRegistrant.count()).toBe(1)
  })
})
