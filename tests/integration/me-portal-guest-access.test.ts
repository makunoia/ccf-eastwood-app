/**
 * Guests in the member portal.
 *
 * A guest can now verify by mobile and answer one question — who is your DGroup
 * leader? — and answering it promotes them to a Member without a DGroup. That
 * promotion is what makes the rest of the portal possible for them at all:
 * `SmallGroup.leaderId` requires a Member, so a guest could never register the
 * groups they lead while they were still a guest.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { verifyMemberMobile } from "@/app/me/actions"
import { createLedGroup, declareLeaderAndJoin } from "@/app/me/[token]/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "Member", "Guest", "SmallGroup", "SmallGroupLog", "SmallGroupMemberRequest",
    "SchedulePreference", "Event", "EventRegistrant", "Family", "FamilyMember"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedGuest(
  overrides: Partial<{
    firstName: string
    phone: string | null
    email: string | null
    selfServiceToken: string | null
    claimedSmallGroupId: string | null
    claimedSatellite: string | null
  }> = {}
) {
  return db.guest.create({
    data: {
      firstName: overrides.firstName ?? "Gina",
      lastName: "Guest",
      phone: overrides.phone ?? "+63 917 111 2222",
      email: overrides.email ?? null,
      selfServiceToken: overrides.selfServiceToken ?? null,
      claimedSmallGroupId: overrides.claimedSmallGroupId ?? null,
      claimedSatellite: overrides.claimedSatellite ?? null,
      language: [],
    },
  })
}

/** Every group needs a leader; these tests rarely care who. */
let seq = 0
async function seedGroup(name = "Target Group", memberLimit: number | null = null) {
  const leader = await db.member.create({
    data: {
      firstName: `Leader${++seq}`,
      lastName: "Seed",
      dateJoined: new Date(),
      language: [],
    },
  })
  return db.smallGroup.create({
    data: { name, leaderId: leader.id, memberLimit, language: [] },
  })
}

describe("verifyMemberMobile — guests", () => {
  it("issues a token to a guest matched by normalized phone", async () => {
    const guest = await seedGuest({ phone: "+63 917 123 4567" })

    const result = await verifyMemberMobile("09171234567")

    expect(result.success).toBe(true)
    if (!result.success) return
    const refreshed = await db.guest.findUnique({ where: { id: guest.id } })
    expect(refreshed?.selfServiceToken).toBe(result.data.token)
  })

  it("reuses an existing guest token rather than rotating it", async () => {
    await seedGuest({ phone: "+63 917 123 4567", selfServiceToken: "guest-tok" })

    const result = await verifyMemberMobile("+63 917 123 4567")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.token).toBe("guest-tok")
  })

  it("prefers the member when a number matches both", async () => {
    // A promoted guest keeps their guest row as history — they are a member now,
    // and must land in the member portal, not back on the onboarding question.
    const member = await db.member.create({
      data: {
        firstName: "Both",
        lastName: "Records",
        phone: "+63 917 123 4567",
        selfServiceToken: "member-tok",
        dateJoined: new Date(),
        language: [],
      },
    })
    await seedGuest({
      phone: "+63 917 123 4567",
      selfServiceToken: "guest-tok",
    })
    await db.guest.updateMany({ data: { memberId: member.id } })

    const result = await verifyMemberMobile("+63 917 123 4567")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.token).toBe("member-tok")
  })

  it("reports an unknown number without leaking which records exist", async () => {
    const result = await verifyMemberMobile("09179999999")
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/couldn't find you/i)
  })
})

describe("declareLeaderAndJoin — satellite", () => {
  it("promotes the guest without a DGroup and records the satellite", async () => {
    const guest = await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUnique({
      where: { selfServiceToken: result.data.token },
    })
    expect(member).not.toBeNull()
    expect(member?.firstName).toBe(guest.firstName)
    expect(member?.smallGroupId).toBeNull()
    // Naming a leader is not joining a group — groupStatus stays null.
    expect(member?.groupStatus).toBeNull()
    expect(member?.upwardSatellite).toBe("CCF Cebu")

    const refreshedGuest = await db.guest.findUnique({ where: { id: guest.id } })
    expect(refreshedGuest?.memberId).toBe(member?.id)
    expect(refreshedGuest?.claimedSatellite).toBe("CCF Cebu")
    expect(refreshedGuest?.claimedSmallGroupId).toBeNull()

    // No request to anyone — their leader is outside Eastwood.
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("carries event registrations across to the new member", async () => {
    const guest = await seedGuest({ selfServiceToken: "g-1" })
    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUniqueOrThrow({
      where: { selfServiceToken: result.data.token },
    })
    const refreshed = await db.eventRegistrant.findUnique({
      where: { id: registrant.id },
    })
    expect(refreshed?.memberId).toBe(member.id)
    expect(refreshed?.guestId).toBeNull()
  })

  it("rejects a satellite outside the Philippine list, leaving them a guest", async () => {
    const guest = await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Singapore",
    })

    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
    expect((await db.guest.findUnique({ where: { id: guest.id } }))?.memberId).toBeNull()
  })

  it("rejects CCF Eastwood itself — that's a DGroup here, not a satellite", async () => {
    await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Eastwood",
    })

    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })

  it("rejects an empty satellite", async () => {
    await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", { scope: "satellite", satellite: "" })

    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })
})

describe("declareLeaderAndJoin — a leader here at Eastwood", () => {
  it("promotes them and files a pending request with a log", async () => {
    const group = await seedGroup()
    const guest = await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "eastwood",
      groupId: group.id,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUniqueOrThrow({
      where: { selfServiceToken: result.data.token },
    })
    // Requested, not placed — the leader still has to confirm.
    expect(member.smallGroupId).toBeNull()
    expect(member.upwardSatellite).toBeNull()

    const request = await db.smallGroupMemberRequest.findFirstOrThrow()
    expect(request.memberId).toBe(member.id)
    expect(request.smallGroupId).toBe(group.id)
    expect(request.status).toBe("Pending")
    // The request is filed against the Member, not the guest they used to be.
    expect(request.guestId).toBeNull()

    const log = await db.smallGroupLog.findFirstOrThrow({
      where: { smallGroupId: group.id },
    })
    expect(log.action).toBe("TempAssignmentCreated")

    const refreshedGuest = await db.guest.findUnique({ where: { id: guest.id } })
    expect(refreshedGuest?.claimedSmallGroupId).toBe(group.id)
    expect(refreshedGuest?.claimedSatellite).toBeNull()
  })

  it("refuses a full group, leaving them a guest", async () => {
    const group = await seedGroup("Full Group", 1)
    await db.member.create({
      data: {
        firstName: "Only",
        lastName: "Seat",
        smallGroupId: group.id,
        groupStatus: "Member",
        dateJoined: new Date(),
        language: [],
      },
    })
    const guest = await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "eastwood",
      groupId: group.id,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/already full/i)
    expect((await db.guest.findUnique({ where: { id: guest.id } }))?.memberId).toBeNull()
  })

  it("refuses a group that doesn't exist", async () => {
    await seedGuest({ selfServiceToken: "g-1" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "eastwood",
      groupId: "nope",
    })

    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })

  it("clears a stale claimed satellite when they name a group here instead", async () => {
    const group = await seedGroup()
    const guest = await seedGuest({
      selfServiceToken: "g-1",
      claimedSatellite: "CCF Davao",
    })

    expect(
      (await declareLeaderAndJoin("g-1", { scope: "eastwood", groupId: group.id })).success
    ).toBe(true)

    const refreshed = await db.guest.findUnique({ where: { id: guest.id } })
    expect(refreshed?.claimedSatellite).toBeNull()
    expect(refreshed?.claimedSmallGroupId).toBe(group.id)
  })
})

describe("declareLeaderAndJoin — guards", () => {
  it("rejects an unknown token", async () => {
    const result = await declareLeaderAndJoin("nope", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })
    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })

  it("rejects an empty token", async () => {
    const result = await declareLeaderAndJoin("", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a guest who has already been promoted", async () => {
    await seedGuest({ selfServiceToken: "g-1" })
    expect(
      (await declareLeaderAndJoin("g-1", { scope: "satellite", satellite: "CCF Cebu" }))
        .success
    ).toBe(true)

    const second = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Davao",
    })

    expect(second.success).toBe(false)
    if (second.success) return
    expect(second.error).toMatch(/already told us/i)
    expect(await db.member.count()).toBe(1)
  })

  it("reuses an existing member when the guest's email already belongs to one", async () => {
    // The public token flows resolve this collision by reusing rather than
    // hitting P2002 mid-promotion — Member.email is unique.
    const existing = await db.member.create({
      data: {
        firstName: "Same",
        lastName: "Person",
        email: "same@example.com",
        dateJoined: new Date(),
        language: [],
      },
    })
    await seedGuest({ selfServiceToken: "g-1", email: "same@example.com" })

    const result = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(await db.member.count()).toBe(1)
    const refreshed = await db.member.findUniqueOrThrow({ where: { id: existing.id } })
    expect(refreshed.selfServiceToken).toBe(result.data.token)
    expect(refreshed.upwardSatellite).toBe("CCF Cebu")
  })
})

describe("the promoted guest can then add the groups they lead", () => {
  it("passes the leader-first gate straight after declaring", async () => {
    // The whole point of asking first: the answer unlocks the next step.
    await seedGuest({ selfServiceToken: "g-1" })
    const declared = await declareLeaderAndJoin("g-1", {
      scope: "satellite",
      satellite: "CCF Cebu",
    })
    expect(declared.success).toBe(true)
    if (!declared.success) return

    const created = await createLedGroup(declared.data.token, {
      name: "My New DGroup",
      groupType: "Regular",
      meetingFormat: "InPerson",
      locationCity: "Quezon City",
      language: ["English"],
      ageRangeMin: "",
      ageRangeMax: "",
      memberLimit: "",
      scheduleDayOfWeek: 2,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })

    expect(created.success).toBe(true)
    if (!created.success) return
    const group = await db.smallGroup.findUniqueOrThrow({
      where: { id: created.data.id },
    })
    expect(group.parentSatellite).toBe("CCF Cebu")
  })
})
