import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import { lookupProfileByMobile } from "@/app/(dashboard)/events/registration-lookup-actions"

/**
 * A Collab day's registrant list starts fresh.
 *
 * The reported bug: the member events of a collab are real, long-running events
 * with their own registrant lists, and `EventRegistrant` is one row per person
 * per event **series**. Every regular of either ministry therefore already held a
 * row when the day's shared form opened — and the fan-out read that row as
 * "already registered", so their submission created nothing, seated them at none
 * of the day's tables, and reported an outcome about a sign-up made months
 * earlier. The day inherited both ministries' rosters instead of building its own.
 *
 * Identity lookup is deliberately NOT part of that reset: the mobile-number step
 * still resolves people against the whole Member and Guest pool. Those two facts
 * are what this file pins together.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "Ministry", "EventMinistry", "EventCluster", "EventClusterEvent", "Event", "EventRegistrant", "BreakoutGroup", "BreakoutGroupMember", "Volunteer", "VolunteerCommittee", "CommitteeRole", "Member", "Guest", "LifeStage", "EventModule", "SmallGroup", "SmallGroupMemberRequest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const DAY = new Date("2026-09-05T00:00:00.000Z")

/** Two ministries, each with a long-running weekly event, sharing one day. */
async function openDay(kind: "Parallel" | "Collab") {
  const cluster = await db.eventCluster.create({
    data: { name: "Youth × Singles Night", date: DAY, kind, isOpen: true },
    select: { id: true, publicToken: true },
  })
  const youthMinistry = await db.ministry.create({
    data: { name: "Youth" },
    select: { id: true },
  })
  const singlesMinistry = await db.ministry.create({
    data: { name: "Singles" },
    select: { id: true },
  })
  const youth = await db.event.create({
    data: {
      name: "Youth Night",
      type: "Recurring",
      startDate: DAY,
      endDate: DAY,
      autoAssignBreakout: true,
    },
    select: { id: true },
  })
  const singles = await db.event.create({
    data: {
      name: "Singles Connect",
      type: "Recurring",
      startDate: DAY,
      endDate: DAY,
      autoAssignBreakout: true,
    },
    select: { id: true },
  })
  await db.eventMinistry.createMany({
    data: [
      { eventId: youth.id, ministryId: youthMinistry.id },
      { eventId: singles.id, ministryId: singlesMinistry.id },
    ],
  })
  await db.eventClusterEvent.createMany({
    data: [
      { clusterId: cluster.id, eventId: youth.id, order: 0 },
      { clusterId: cluster.id, eventId: singles.id, order: 1 },
    ],
  })
  // Breakout placement is module-gated on every write path.
  await db.eventModule.createMany({
    data: [
      { eventId: youth.id, type: "Breakout" },
      { eventId: singles.id, type: "Breakout" },
    ],
  })
  return { ...cluster, youthId: youth.id, singlesId: singles.id }
}

/** A Youth regular: on file, and already holding a row on the weekly series. */
async function seedRegular(eventId: string) {
  const member = await db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Cruz",
      dateJoined: new Date(),
      language: [],
      phone: "+63 917 111 2222",
      birthMonth: 4,
      birthYear: 1998,
    },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, memberId: member.id, createdAt: new Date("2026-01-04T02:00:00.000Z") },
    select: { id: true },
  })
  return { memberId: member.id, registrantId: registrant.id }
}

const payload = { firstName: "Maria", lastName: "Cruz", mobileNumber: "0917 111 2222" }

// ─── The reported bug ────────────────────────────────────────────────────────

describe("a Collab day does not inherit its member events' registrants", () => {
  it("registers a regular for the day instead of short-circuiting on their series row", async () => {
    const day = await openDay("Collab")
    const { memberId, registrantId } = await seedRegular(day.youthId)
    await db.breakoutGroup.create({ data: { clusterId: day.id, name: "Table 1" } })

    const result = await registerForCluster(
      day.publicToken,
      payload,
      memberId,
      null,
      undefined,
      [day.youthId]
    )

    expect(result.success).toBe(true)
    if (result.success) {
      // Not "already" — this submission IS the day's registration for them.
      expect(result.data.results).toEqual([
        expect.objectContaining({ eventId: day.youthId, status: "registered" }),
      ])
      expect(result.data.results[0].breakoutGroup?.name).toBe("Table 1")
    }

    // The row is reused, never duplicated: the underlying event must not gain a
    // second registration for one person.
    const rows = await db.eventRegistrant.findMany({
      where: { eventId: day.youthId, memberId },
      select: { id: true, registrationClusterId: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(registrantId)
    expect(rows[0].registrationClusterId).toBe(day.id)
  })

  it("seats them at one of the day's tables, not their ministry's standing one", async () => {
    const day = await openDay("Collab")
    const { memberId, registrantId } = await seedRegular(day.youthId)
    // The regular's standing placement in Youth's own group — untouched by the day.
    const standing = await db.breakoutGroup.create({
      data: { eventId: day.youthId, name: "Youth Cell A" },
      select: { id: true },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: standing.id, registrantId },
    })
    const dayTable = await db.breakoutGroup.create({
      data: { clusterId: day.id, name: "Table 1" },
      select: { id: true },
    })

    await registerForCluster(day.publicToken, payload, memberId, null, undefined, [day.youthId])

    const seats = await db.breakoutGroupMember.findMany({
      where: { registrantId },
      select: { breakoutGroupId: true },
    })
    expect(seats.map((s) => s.breakoutGroupId).sort()).toEqual(
      [standing.id, dayTable.id].sort()
    )
  })

  it("says already the second time, and does not re-seat them", async () => {
    const day = await openDay("Collab")
    const { memberId, registrantId } = await seedRegular(day.youthId)
    await db.breakoutGroup.createMany({
      data: [
        { clusterId: day.id, name: "Table 1" },
        { clusterId: day.id, name: "Table 2" },
      ],
    })

    await registerForCluster(day.publicToken, payload, memberId, null, undefined, [day.youthId])
    const second = await registerForCluster(
      day.publicToken,
      payload,
      memberId,
      null,
      undefined,
      [day.youthId]
    )

    expect(second.success).toBe(true)
    if (second.success) expect(second.data.results[0].status).toBe("already")

    expect(await db.eventRegistrant.count({ where: { memberId } })).toBe(1)
    expect(await db.breakoutGroupMember.count({ where: { registrantId } })).toBe(1)
  })

  it("leaves a Parallel day reading an existing registration as already", async () => {
    const day = await openDay("Parallel")
    const { memberId, registrantId } = await seedRegular(day.youthId)

    const result = await registerForCluster(
      day.publicToken,
      payload,
      memberId,
      null,
      undefined,
      [day.youthId]
    )

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.results[0].status).toBe("already")
    // Still stamped for the day — the roll-up counts people by that column.
    const row = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { registrationClusterId: true },
    })
    expect(row?.registrationClusterId).toBe(day.id)
  })
})

// ─── Amending ────────────────────────────────────────────────────────────────

describe("an amend resolves to the day's registration", () => {
  it("prefers this day's half over a stale row on the other ministry's event", async () => {
    const day = await openDay("Collab")
    const { memberId } = await seedRegular(day.youthId)
    // They came through the day's form under Singles; the Youth row is history.
    await db.eventRegistrant.create({
      data: { eventId: day.singlesId, memberId, registrationClusterId: day.id },
    })

    // The ministry step isn't shown on an amend, so the selection arrives empty.
    const result = await registerForCluster(
      day.publicToken,
      payload,
      memberId,
      null,
      undefined,
      []
    )

    expect(result.success).toBe(true)
    // Cluster order would otherwise have picked Youth, amending a months-old
    // sign-up on the half they did not register for.
    if (result.success) expect(result.data.results[0].eventId).toBe(day.singlesId)
  })
})

// ─── Identity lookup is not part of the reset ────────────────────────────────

describe("the mobile-number step still draws on the whole people pool", () => {
  it("finds a member with no registration of any kind", async () => {
    await openDay("Collab")
    await db.member.create({
      data: {
        firstName: "Josh",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: [],
        phone: "+63 917 333 4444",
        birthMonth: 2,
        birthYear: 1995,
      },
    })

    // Any input format resolves to the one stored record.
    const result = await lookupProfileByMobile({ mobileNumber: "0917 333 4444" })
    expect(result.outcome).toBe("match")
    if (result.outcome === "match") expect(result.recordType).toBe("member")
  })

  it("falls through to an active guest", async () => {
    await openDay("Collab")
    await db.guest.create({
      data: { firstName: "Ana", lastName: "Lim", phone: "+63 917 555 6666", language: [] },
    })

    const result = await lookupProfileByMobile({ mobileNumber: "+639175556666" })
    expect(result.outcome).toBe("match")
    if (result.outcome === "match") expect(result.recordType).toBe("guest")
  })

  it("keeps finding a regular whose day registration was just reset to fresh", async () => {
    const day = await openDay("Collab")
    const { memberId } = await seedRegular(day.youthId)

    const result = await lookupProfileByMobile({ mobileNumber: "0917 111 2222" })
    expect(result.outcome).toBe("match")
    if (result.outcome === "match") expect(result.recordId).toBe(memberId)
  })
})
