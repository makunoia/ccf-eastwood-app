/**
 * `recordMemberGroupClaim` — a Member answering "I'm already in a DGroup" on a
 * public surface.
 *
 * The branch used to be guest-only. The reason given was storage: a guest has
 * `claimedSmallGroupId` / `claimedSatellite` to hold a self-report, and a member
 * had nowhere, because `Member.smallGroupId` is real membership only an admin
 * may set. The member portal (CCF-103) already solved that with a Pending
 * request; this is the same pair of writes made reachable from the registration
 * form and the check-in kiosk.
 *
 * The invariant these pin, in one line: **a claim never becomes membership.**
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { recordMemberGroupClaim } from "@/lib/small-groups/member-claim"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(data: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      dateJoined: new Date(),
      language: [],
      ...data,
    },
  })
}

async function seedGroup(name = "Ortigas Young Pro") {
  const leader = await db.member.create({
    data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
  })
  const group = await db.smallGroup.create({
    data: { name, leaderId: leader.id, language: [] },
  })
  return { leader, group }
}

describe("naming a leader here", () => {
  it("raises a Pending request instead of writing membership", async () => {
    const member = await seedMember()
    const { group } = await seedGroup()

    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "group", smallGroupId: group.id },
      "event registration"
    )

    expect(res).toMatchObject({ recorded: true, scope: "group" })

    const request = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: member.id },
    })
    expect(request.smallGroupId).toBe(group.id)
    expect(request.status).toBe("Pending")
    // Not `RegistrationIntent` — that origin is reserved for the groupless
    // "I want to join *a* DGroup" rows the Seeking tab reads, and a
    // group-bearing row there would break that tab's one invariant.
    expect(request.origin).toBe("Assignment")

    // The whole point: still not a member of anything.
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.smallGroupId).toBeNull()
    expect(after.groupStatus).toBeNull()
  })

  it("logs the claim against the group, attributed to the member", async () => {
    const member = await seedMember()
    const { group } = await seedGroup()

    await recordMemberGroupClaim(
      member.id,
      { scope: "group", smallGroupId: group.id },
      "event check-in"
    )

    const log = await db.smallGroupLog.findFirstOrThrow({
      where: { smallGroupId: group.id },
    })
    expect(log.action).toBe("TempAssignmentCreated")
    expect(log.memberId).toBe(member.id)
    // Public token/kiosk flows have no admin User to blame, so the actor is the
    // member themselves — same convention as the portal's writes.
    expect(log.performedByMemberId).toBe(member.id)
    // The source is spliced in so an admin reading group history can tell a
    // kiosk claim from a portal declaration.
    expect(log.description).toContain("event check-in")
  })

  it("refuses a member who is already placed in a DGroup", async () => {
    const { group } = await seedGroup()
    const { group: other } = await seedGroup("Makati Couples")
    const member = await seedMember({ smallGroupId: group.id, groupStatus: "Member" })

    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "group", smallGroupId: other.id },
      "event registration"
    )

    // Claiming a *different* group from the one they're in is a transfer, which
    // is not what this question asks. It must not queue one silently.
    expect(res).toEqual({ recorded: false, reason: "already-placed" })
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("does not stack a second request on an open one", async () => {
    const member = await seedMember()
    const { group } = await seedGroup()
    await db.smallGroupMemberRequest.create({
      data: { memberId: member.id, smallGroupId: group.id, status: "Pending" },
    })

    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "group", smallGroupId: group.id },
      "event registration"
    )

    expect(res).toEqual({ recorded: false, reason: "already-requested" })
    expect(await db.smallGroupMemberRequest.count()).toBe(1)
  })

  it("asks again after an earlier request was rejected", async () => {
    const member = await seedMember()
    const { group } = await seedGroup()
    await db.smallGroupMemberRequest.create({
      data: {
        memberId: member.id,
        smallGroupId: group.id,
        status: "Rejected",
        resolvedAt: new Date(),
      },
    })

    // A resolved request is history, not an open queue entry — a rejected one
    // must not silence the question forever.
    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "group", smallGroupId: group.id },
      "event registration"
    )
    expect(res).toMatchObject({ recorded: true })
    expect(await db.smallGroupMemberRequest.count({ where: { status: "Pending" } })).toBe(1)
  })

  it("rejects an unknown or inactive group without throwing", async () => {
    const member = await seedMember()
    const { group } = await seedGroup()
    await db.smallGroup.update({ where: { id: group.id }, data: { status: "Inactive" } })

    expect(
      await recordMemberGroupClaim(member.id, { scope: "group", smallGroupId: group.id }, "event registration")
    ).toEqual({ recorded: false, reason: "group-not-found" })
    expect(
      await recordMemberGroupClaim(member.id, { scope: "group", smallGroupId: "nope" }, "event registration")
    ).toEqual({ recorded: false, reason: "group-not-found" })
  })
})

describe("naming another CCF satellite", () => {
  it("sets upwardSatellite rather than raising a request", async () => {
    const member = await seedMember()

    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "satellite", satellite: "CCF Cebu" },
      "event registration"
    )

    expect(res).toEqual({ recorded: true, scope: "satellite" })
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.upwardSatellite).toBe("CCF Cebu")
    // There is no local group to ask, so a request would have no recipient.
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("mirrors the satellite onto every group the member leads", async () => {
    const member = await seedMember()
    const led = await db.smallGroup.create({
      data: { name: "Led Group", leaderId: member.id, language: [] },
    })

    await recordMemberGroupClaim(
      member.id,
      { scope: "satellite", satellite: "CCF Cebu" },
      "event registration"
    )

    const after = await db.smallGroup.findUniqueOrThrow({ where: { id: led.id } })
    expect(after.parentSatellite).toBe("CCF Cebu")
    // The parent is either a DGroup here or a satellite — never both.
    expect(after.parentGroupId).toBeNull()
  })

  it("refuses a satellite that is not on the allow-list", async () => {
    const member = await seedMember()

    const res = await recordMemberGroupClaim(
      member.id,
      { scope: "satellite", satellite: "Not A Real Satellite" },
      "event registration"
    )

    expect(res).toEqual({ recorded: false, reason: "unknown-satellite" })
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.upwardSatellite).toBeNull()
  })

  it("refuses CCF Eastwood itself — that is a local group, not a satellite", async () => {
    const member = await seedMember()

    expect(
      await recordMemberGroupClaim(member.id, { scope: "satellite", satellite: "CCF Eastwood" }, "event registration")
    ).toEqual({ recorded: false, reason: "unknown-satellite" })
  })
})

describe("edge cases", () => {
  it("returns a reason rather than throwing for an unknown member", async () => {
    const { group } = await seedGroup()

    expect(
      await recordMemberGroupClaim("nope", { scope: "group", smallGroupId: group.id }, "event registration")
    ).toEqual({ recorded: false, reason: "member-not-found" })
  })
})
