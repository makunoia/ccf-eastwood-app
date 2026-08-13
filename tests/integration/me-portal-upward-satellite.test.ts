/**
 * The member portal's upward-accountability choice: a DGroup leader whose own
 * leader sits outside CCF Eastwood declares the satellite instead of requesting
 * to join a DGroup here. The two sides are mutually exclusive — declaring a
 * satellite drops the local membership and any pending request, and joining a
 * DGroup here drops the satellite *when the join is confirmed*, not when it is
 * merely requested.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { requestGroupChange, setUpwardSatellite } from "@/app/me/[token]/actions"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"

/**
 * Every DGroup requires a leader (SmallGroup.leaderId is NOT NULL). These tests
 * don't care who it is, so each group gets a throwaway member. The leader has no
 * smallGroupId of their own, so they never count toward a group's roster.
 */
let __leaderSeq = 0
async function aLeader(): Promise<string> {
  const m = await db.member.create({
    data: {
      firstName: `Leader${++__leaderSeq}`,
      lastName: "Seed",
      dateJoined: new Date(),
      language: [],
    },
    select: { id: true },
  })
  return m.id
}


beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupLog", "SmallGroupMemberRequest", "ConfirmationSubmission" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(firstName: string, token?: string) {
  return db.member.create({
    data: {
      firstName,
      lastName: "Tester",
      dateJoined: new Date(),
      language: [],
      ...(token ? { selfServiceToken: token } : {}),
    },
  })
}

/** Groups always have a leader; callers who don't care about who get a throwaway. */
async function seedGroup(name: string, leaderId?: string) {
  return db.smallGroup.create({
    data: { name, leaderId: leaderId ?? (await aLeader()), language: [] },
  })
}

describe("setUpwardSatellite", () => {
  it("records the satellite on every group the member leads", async () => {
    const leader = await seedMember("Lea", "tok-1")
    const a = await seedGroup("Group A", leader.id)
    const b = await seedGroup("Group B", leader.id)

    const res = await setUpwardSatellite("tok-1", "CCF Baguio")
    expect(res.success).toBe(true)

    const groups = await db.smallGroup.findMany({
      where: { id: { in: [a.id, b.id] } },
    })
    for (const g of groups) {
      expect(g.parentSatellite).toBe("CCF Baguio")
      expect(g.parentGroupId).toBeNull()
    }
  })

  it("drops the parent group — the parent is a DGroup here or a satellite, never both", async () => {
    const other = await seedMember("Other")
    const parent = await seedGroup("Parent Group", other.id)
    const leader = await seedMember("Lea", "tok-1")
    const led = await db.smallGroup.create({
      data: {
        name: "Led Group",
        leaderId: leader.id,
        parentGroupId: parent.id,
        language: [],
      },
    })

    const res = await setUpwardSatellite("tok-1", "CCF Cebu")
    expect(res.success).toBe(true)

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentGroupId).toBeNull()
    expect(refreshed?.parentSatellite).toBe("CCF Cebu")
  })

  it("releases the leader's own Eastwood membership and logs it", async () => {
    const other = await seedMember("Other")
    const parent = await seedGroup("Parent Group", other.id)
    const leader = await db.member.create({
      data: {
        firstName: "Lea",
        lastName: "Tester",
        dateJoined: new Date(),
        language: [],
        selfServiceToken: "tok-1",
        smallGroupId: parent.id,
        groupStatus: "Member",
      },
    })
    await seedGroup("Led Group", leader.id)

    const res = await setUpwardSatellite("tok-1", "CCF Davao")
    expect(res.success).toBe(true)

    const refreshed = await db.member.findUnique({ where: { id: leader.id } })
    expect(refreshed?.smallGroupId).toBeNull()
    expect(refreshed?.groupStatus).toBeNull()

    const log = await db.smallGroupLog.findFirst({
      where: { smallGroupId: parent.id, action: "MemberRemoved" },
    })
    expect(log?.memberId).toBe(leader.id)
    expect(log?.performedByMemberId).toBe(leader.id)
    expect(log?.description).toContain("CCF Davao")
  })

  it("withdraws a pending request to join a DGroup here", async () => {
    const other = await seedMember("Other")
    const target = await seedGroup("Target Group", other.id)
    const leader = await seedMember("Lea", "tok-1")
    await seedGroup("Led Group", leader.id)
    const request = await db.smallGroupMemberRequest.create({
      data: { smallGroupId: target.id, memberId: leader.id },
    })

    const res = await setUpwardSatellite("tok-1", "CCF Iloilo")
    expect(res.success).toBe(true)

    const refreshed = await db.smallGroupMemberRequest.findUnique({
      where: { id: request.id },
    })
    expect(refreshed?.status).toBe("Rejected")
    expect(refreshed?.resolvedAt).not.toBeNull()
  })

  it("clears the satellite when passed null, leaving membership untouched", async () => {
    const leader = await seedMember("Lea", "tok-1")
    const led = await db.smallGroup.create({
      data: {
        name: "Led Group",
        leaderId: leader.id,
        parentSatellite: "CCF Cebu",
        language: [],
      },
    })

    const res = await setUpwardSatellite("tok-1", null)
    expect(res.success).toBe(true)

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBeNull()
  })

  it("rejects a satellite outside the Philippine list", async () => {
    const leader = await seedMember("Lea", "tok-1")
    const led = await seedGroup("Led Group", leader.id)

    const res = await setUpwardSatellite("tok-1", "CCF Singapore")
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error).toMatch(/unknown ccf satellite/i)

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBeNull()
  })

  it("rejects CCF Eastwood itself — a leader here belongs to a parent DGroup", async () => {
    const leader = await seedMember("Lea", "tok-1")
    await seedGroup("Led Group", leader.id)

    const res = await setUpwardSatellite("tok-1", "CCF Eastwood")
    expect(res.success).toBe(false)
  })

  it("accepts a member who leads no group, recording it on the member", async () => {
    // Behaviour change: this used to be refused ("Only DGroup leaders can set
    // this"), which put the question after the thing it gates. The portal now
    // asks who your leader is *before* you add the groups you lead, so someone
    // who leads nothing needs somewhere to put the answer — Member.upwardSatellite.
    const member = await seedMember("Plain", "tok-1")

    const res = await setUpwardSatellite("tok-1", "CCF Cebu")

    expect(res.success).toBe(true)
    const refreshed = await db.member.findUnique({ where: { id: member.id } })
    expect(refreshed?.upwardSatellite).toBe("CCF Cebu")
    expect(await db.smallGroup.count({ where: { leaderId: member.id } })).toBe(0)
  })

  it("records the satellite on the member as well as their groups", async () => {
    const leader = await seedMember("Lea", "tok-1")
    const led = await seedGroup("Led Group", leader.id)

    expect((await setUpwardSatellite("tok-1", "CCF Iloilo")).success).toBe(true)

    expect(
      (await db.member.findUnique({ where: { id: leader.id } }))?.upwardSatellite
    ).toBe("CCF Iloilo")
    expect(
      (await db.smallGroup.findUnique({ where: { id: led.id } }))?.parentSatellite
    ).toBe("CCF Iloilo")
  })

  it("clears both copies when passed null", async () => {
    const leader = await seedMember("Lea", "tok-1")
    await db.member.update({
      where: { id: leader.id },
      data: { upwardSatellite: "CCF Cebu" },
    })
    const led = await db.smallGroup.create({
      data: {
        name: "Led Group",
        leaderId: leader.id,
        parentSatellite: "CCF Cebu",
        language: [],
      },
    })

    expect((await setUpwardSatellite("tok-1", null)).success).toBe(true)

    expect(
      (await db.member.findUnique({ where: { id: leader.id } }))?.upwardSatellite
    ).toBeNull()
    expect(
      (await db.smallGroup.findUnique({ where: { id: led.id } }))?.parentSatellite
    ).toBeNull()
  })

  it("rejects an unknown token", async () => {
    const leader = await seedMember("Lea", "tok-1")
    const led = await seedGroup("Led Group", leader.id)

    const res = await setUpwardSatellite("nope", "CCF Cebu")
    expect(res.success).toBe(false)

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBeNull()
  })

  it("rejects an empty token", async () => {
    const res = await setUpwardSatellite("", "CCF Cebu")
    expect(res.success).toBe(false)
  })
})

/**
 * A request is an intention, not a move. The satellite is the leader's only true
 * upward answer until someone confirms them into a DGroup here — clearing it at
 * request time stranded a leader whose request was then rejected.
 */
describe("requestGroupChange — interaction with the satellite", () => {
  /** A leader who declared a satellite and then asked to join a group here. */
  async function seedRequestingLeader() {
    const other = await seedMember("Other")
    const target = await db.smallGroup.create({
      data: {
        name: "Target Group",
        leaderId: other.id,
        leaderConfirmationToken: "leader-tok",
        language: [],
      },
    })
    const leader = await seedMember("Lea", "tok-1")
    const led = await db.smallGroup.create({
      data: {
        name: "Led Group",
        leaderId: leader.id,
        parentSatellite: "CCF Cebu",
        language: [],
      },
    })

    const res = await requestGroupChange("tok-1", target.id)
    expect(res.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: leader.id },
    })
    expect(request.status).toBe("Pending")
    expect(request.smallGroupId).toBe(target.id)
    return { leader, led, target, request }
  }

  it("keeps the satellite while the request is only pending", async () => {
    const { led } = await seedRequestingLeader()

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBe("CCF Cebu")
  })

  it("clears the satellite once the target leader confirms", async () => {
    const { leader, led, request } = await seedRequestingLeader()

    const res = await submitMemberConfirmations("leader-tok", [
      { requestId: request.id, status: "confirmed" },
    ])
    expect(res.success).toBe(true)

    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBeNull()
    const moved = await db.member.findUnique({ where: { id: leader.id } })
    expect(moved?.smallGroupId).toBeTruthy()
  })

  it("leaves the satellite standing when the request is rejected", async () => {
    const { leader, led, request } = await seedRequestingLeader()

    const res = await submitMemberConfirmations("leader-tok", [
      { requestId: request.id, status: "rejected" },
    ])
    expect(res.success).toBe(true)

    // The whole point: a rejected request must not leave them with no upward
    // record at all.
    const refreshed = await db.smallGroup.findUnique({ where: { id: led.id } })
    expect(refreshed?.parentSatellite).toBe("CCF Cebu")
    const unmoved = await db.member.findUnique({ where: { id: leader.id } })
    expect(unmoved?.smallGroupId).toBeNull()
  })

  it("leaves other leaders' satellites alone on confirmation", async () => {
    const otherLeader = await seedMember("Other")
    const otherGroup = await db.smallGroup.create({
      data: {
        name: "Other Led Group",
        leaderId: otherLeader.id,
        parentSatellite: "CCF Davao",
        language: [],
      },
    })
    const target = await db.smallGroup.create({
      data: {
        name: "Target Group",
        leaderId: otherLeader.id,
        leaderConfirmationToken: "leader-tok",
        language: [],
      },
    })
    await seedMember("Plain", "tok-1")

    expect((await requestGroupChange("tok-1", target.id)).success).toBe(true)
    const request = await db.smallGroupMemberRequest.findFirstOrThrow()
    expect(
      (await submitMemberConfirmations("leader-tok", [
        { requestId: request.id, status: "confirmed" },
      ])).success
    ).toBe(true)

    const refreshed = await db.smallGroup.findUnique({
      where: { id: otherGroup.id },
    })
    expect(refreshed?.parentSatellite).toBe("CCF Davao")
  })
})

/**
 * The helper itself, since three confirmation paths call it as a one-liner: the
 * leader confirmation link (covered above), the catch-mech resolver, and the
 * admin couple-confirm. Pinning its contract here covers the other two.
 */
describe("clearUpwardSatelliteOnConfirm", () => {
  it("clears only the named members' groups, and only those with a satellite", async () => {
    const confirmed = await seedMember("Confirmed")
    const untouched = await seedMember("Untouched")
    const withSatellite = await db.smallGroup.create({
      data: { name: "Has Satellite", leaderId: confirmed.id, parentSatellite: "CCF Cebu", language: [] },
    })
    const withoutSatellite = await seedGroup("No Satellite", confirmed.id)
    const otherLeaders = await db.smallGroup.create({
      data: { name: "Someone Else", leaderId: untouched.id, parentSatellite: "CCF Davao", language: [] },
    })

    await db.$transaction((tx) => clearUpwardSatelliteOnConfirm(tx, [confirmed.id]))

    expect((await db.smallGroup.findUnique({ where: { id: withSatellite.id } }))?.parentSatellite)
      .toBeNull()
    expect((await db.smallGroup.findUnique({ where: { id: withoutSatellite.id } }))?.parentSatellite)
      .toBeNull()
    expect((await db.smallGroup.findUnique({ where: { id: otherLeaders.id } }))?.parentSatellite)
      .toBe("CCF Davao")
  })

  it("clears the member-level copy too, including for someone who leads nothing", async () => {
    // Both copies record one fact, so a confirmed local membership has to take
    // out both — otherwise the portal keeps showing the stale satellite.
    const confirmed = await seedMember("Confirmed")
    const untouched = await seedMember("Untouched")
    await db.member.updateMany({
      where: { id: { in: [confirmed.id, untouched.id] } },
      data: { upwardSatellite: "CCF Cebu" },
    })

    await db.$transaction((tx) => clearUpwardSatelliteOnConfirm(tx, [confirmed.id]))

    expect(
      (await db.member.findUnique({ where: { id: confirmed.id } }))?.upwardSatellite
    ).toBeNull()
    expect(
      (await db.member.findUnique({ where: { id: untouched.id } }))?.upwardSatellite
    ).toBe("CCF Cebu")
  })

  it("is a no-op for an empty batch — most confirmations involve no leader", async () => {
    const leader = await seedMember("Lea")
    const led = await db.smallGroup.create({
      data: { name: "Led", leaderId: leader.id, parentSatellite: "CCF Cebu", language: [] },
    })

    await db.$transaction((tx) => clearUpwardSatelliteOnConfirm(tx, []))

    expect((await db.smallGroup.findUnique({ where: { id: led.id } }))?.parentSatellite)
      .toBe("CCF Cebu")
  })
})
