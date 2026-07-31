import { describe, it, expect } from "vitest"

import {
  resolveConfirmations,
  type FetchedRegistrant,
  type ResolvedDecision,
} from "@/lib/catch-mech/confirmations"

/**
 * Round-trip guard for resolveConfirmations.
 *
 * It runs inside an interactive transaction while a facilitator waits on a phone,
 * so its cost is measured in sequential queries, not lines of code. It used to
 * issue 7–9 per person: a group of ten held a Postgres connection open for ~80
 * serial round trips to Neon, which is both slow and the thing that makes several
 * facis submitting at once contend for the pool.
 *
 * The fake transaction client below counts calls, so the N+1 shape cannot come
 * back unnoticed — a per-person read or a per-person log insert would break these
 * numbers immediately. Correctness of the same batching is covered against a real
 * database in tests/integration/catch-mech-batching.test.ts.
 */

type Call = { model: string; op: string; args: unknown }

function fakeTx() {
  const calls: Call[] = []
  let memberSeq = 0

  const record = (model: string, op: string, result: unknown) => (args: unknown) => {
    calls.push({ model, op, args })
    return Promise.resolve(result)
  }

  const tx = {
    smallGroupMemberRequest: {
      findMany: record("smallGroupMemberRequest", "findMany", []),
      updateMany: record("smallGroupMemberRequest", "updateMany", { count: 0 }),
      createMany: record("smallGroupMemberRequest", "createMany", { count: 0 }),
    },
    member: {
      create: (args: unknown) => {
        calls.push({ model: "member", op: "create", args })
        memberSeq += 1
        return Promise.resolve({ id: `new-member-${memberSeq}` })
      },
      updateMany: record("member", "updateMany", { count: 0 }),
    },
    guest: { update: record("guest", "update", {}) },
    eventRegistrant: { updateMany: record("eventRegistrant", "updateMany", { count: 0 }) },
    schedulePreference: { createMany: record("schedulePreference", "createMany", { count: 0 }) },
    smallGroupLog: { createMany: record("smallGroupLog", "createMany", { count: 0 }) },
    familyMember: {
      findMany: record("familyMember", "findMany", []),
      deleteMany: record("familyMember", "deleteMany", { count: 0 }),
      updateMany: record("familyMember", "updateMany", { count: 0 }),
    },
  }

  return {
    // The helper only touches the delegates above; the rest of the client is unused.
    tx: tx as unknown as Parameters<typeof resolveConfirmations>[5],
    calls,
    count: (model?: string, op?: string) =>
      calls.filter((c) => (!model || c.model === model) && (!op || c.op === op)).length,
  }
}

function guestRegistrant(n: number): FetchedRegistrant {
  return {
    id: `reg-${n}`,
    memberId: null,
    guestId: `guest-${n}`,
    member: null,
    guest: {
      firstName: `Guest${n}`,
      lastName: "Test",
      memberId: null,
      email: null,
      phone: null,
      notes: null,
      lifeStageId: null,
      gender: null,
      language: [],
      birthMonth: null,
      birthYear: null,
      workCity: null,
      workIndustry: null,
      ageRangeBucketId: null,
      meetingPreference: null,
      scheduleDayOfWeek: null,
      scheduleTimeStart: null,
    },
  } as FetchedRegistrant
}

function run(registrants: FetchedRegistrant[], decisions: ResolvedDecision[]) {
  const f = fakeTx()
  const map = new Map(registrants.map((r) => [r.id, r]))
  return resolveConfirmations(
    "breakout-1",
    "vol-1",
    decisions,
    map,
    new Set<string>(),
    f.tx,
    "Retreat",
    "faci-member",
    "Catch Mech"
  ).then(() => f)
}

const confirmAll = (n: number): ResolvedDecision[] =>
  Array.from({ length: n }, (_, i) => ({
    registrantId: `reg-${i}`,
    status: "confirmed" as const,
    groupId: "group-1",
  }))

describe("resolveConfirmations — batched round trips", () => {
  it("reads pending requests once for the whole table, not once per person", async () => {
    const f = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    expect(f.count("smallGroupMemberRequest", "findMany")).toBe(1)
  })

  it("reads family links once for the whole table", async () => {
    const f = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    expect(f.count("familyMember", "findMany")).toBe(1)
  })

  it("writes all activity logs in a single createMany", async () => {
    const f = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    expect(f.count("smallGroupLog", "createMany")).toBe(1)
    expect(f.count("smallGroupLog", "create")).toBe(0)
    const [log] = f.calls.filter((c) => c.model === "smallGroupLog")
    expect((log.args as { data: unknown[] }).data).toHaveLength(10)
  })

  it("writes all new member requests in a single createMany", async () => {
    const f = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    expect(f.count("smallGroupMemberRequest", "createMany")).toBe(1)
  })

  it("keeps total queries near-linear with a small constant, not 7–9 per person", async () => {
    const f = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    // 3 unavoidable per guest (create the Member, point the Guest at it, repoint
    // that guest's registrations) + a handful of batched calls for the whole set.
    expect(f.count()).toBeLessThanOrEqual(10 * 3 + 6)
    // Pin the old behaviour as clearly gone.
    expect(f.count()).toBeLessThan(70)
  })

  it("scales the per-person cost at exactly 3 writes per promoted guest", async () => {
    const five = await run(
      Array.from({ length: 5 }, (_, i) => guestRegistrant(i)),
      confirmAll(5)
    )
    const ten = await run(
      Array.from({ length: 10 }, (_, i) => guestRegistrant(i)),
      confirmAll(10)
    )
    expect(ten.count() - five.count()).toBe(15)
  })

  it("places everyone joining the same group with one member.updateMany", async () => {
    const registrants = Array.from({ length: 4 }, (_, i) => ({
      id: `reg-${i}`,
      memberId: `member-${i}`,
      guestId: null,
      member: { firstName: "A", lastName: "B", smallGroupId: null },
      guest: null,
    })) as FetchedRegistrant[]

    const f = await run(registrants, confirmAll(4))
    expect(f.count("member", "updateMany")).toBe(1)
    expect(f.count("member", "create")).toBe(0)
  })

  it("collapses declines sharing a reason into one updateMany", async () => {
    const registrants = Array.from({ length: 4 }, (_, i) => guestRegistrant(i))
    const f = fakeTx()
    // Every person has a pending request waiting to be rejected.
    f.tx.smallGroupMemberRequest.findMany = (() =>
      Promise.resolve(
        registrants.map((r, i) => ({
          id: `req-${i}`,
          guestId: r.guestId,
          memberId: null,
          smallGroupId: "group-1",
        }))
      )) as never

    await resolveConfirmations(
      "breakout-1",
      "vol-1",
      registrants.map((r) => ({
        registrantId: r.id,
        status: "declined" as const,
        declineReason: "NotInterested" as const,
        groupId: "group-1",
      })),
      new Map(registrants.map((r) => [r.id, r])),
      new Set<string>(),
      f.tx,
      "Retreat",
      "faci-member",
      "Catch Mech"
    )

    expect(f.count("smallGroupMemberRequest", "updateMany")).toBe(1)
    expect(f.count("smallGroupLog", "createMany")).toBe(1)
  })

  it("does no work at all when every decision is pending", async () => {
    const f = await run(
      [guestRegistrant(0)],
      [{ registrantId: "reg-0", status: "pending", groupId: null }]
    )
    expect(f.count()).toBe(0)
  })

  it("promotes a guest once even if two registrants point at them", async () => {
    // Promotion repoints every registration onto the new Member, so the second
    // decision would otherwise act on a stale prefetched row and create a duplicate.
    const first = guestRegistrant(1)
    const second = { ...guestRegistrant(1), id: "reg-dupe" } as FetchedRegistrant

    const f = await run(
      [first, second],
      [
        { registrantId: "reg-1", status: "confirmed", groupId: "group-1" },
        { registrantId: "reg-dupe", status: "confirmed", groupId: "group-1" },
      ]
    )
    expect(f.count("member", "create")).toBe(1)
  })
})
