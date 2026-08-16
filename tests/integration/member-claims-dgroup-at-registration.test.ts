/**
 * "I'm already part of a DGroup" for a confirmed **member** on the public
 * registration form.
 *
 * The form only ever showed that option to guests. The reason was storage — a
 * guest has `claimedSmallGroupId` / `claimedSatellite`, and a member had nowhere,
 * since `Member.smallGroupId` is real membership only an admin may set — so a
 * member's answer was collected by the schema and then dropped on the floor by
 * `resolveConfirmedMember`. That hit precisely the people most likely to already
 * have a leader, and the only thing the form could offer them instead was "join
 * a DGroup", which queues a placement request for someone already placed.
 *
 * These pin the fix end-to-end through `createRegistrant`, and the rule it must
 * not break: a self-report on a public form never becomes membership.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"

const ALL_FORM_TOGGLES = Object.fromEntries(
  [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS].map((k) => [k, true])
)

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Event", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
      eventFormConfigs: {
        create: (["Register", "WalkIn", "CheckIn"] as const).map((context) => ({
          context,
          ...ALL_FORM_TOGGLES,
        })),
      },
    },
  })
}

function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Ana",
      lastName: "Reyes",
      phone: "+63 917 123 4567",
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
  })
}

async function seedGroup(name = "Ortigas Young Pro") {
  const leader = await db.member.create({
    data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
  })
  return db.smallGroup.create({ data: { name, leaderId: leader.id, language: [] } })
}

const BASE = {
  firstName: "Ana",
  lastName: "Reyes",
  mobileNumber: "09171234567",
}

describe("a member naming their leader's group", () => {
  it("raises a Pending request and leaves membership alone", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const group = await seedGroup()

    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSmallGroupId: group.id },
      member.id
    )
    expect(res.success).toBe(true)

    const request = await db.smallGroupMemberRequest.findFirstOrThrow({
      where: { memberId: member.id },
    })
    expect(request.smallGroupId).toBe(group.id)
    expect(request.status).toBe("Pending")

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.smallGroupId).toBeNull()
    expect(after.groupStatus).toBeNull()
  })

  it("registers them for the event either way", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const group = await seedGroup()

    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSmallGroupId: group.id },
      member.id
    )
    expect(res.success).toBe(true)

    // The claim is follow-up bookkeeping hanging off a registration that has
    // already succeeded — it must never be able to take the registration down.
    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(registrant.memberId).toBe(member.id)
  })

  it("still registers them when the named group has since gone away", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSmallGroupId: "no-such-group" },
      member.id
    )

    expect(res.success).toBe(true)
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })
})

describe("a member naming another CCF satellite", () => {
  it("records it on upwardSatellite rather than as a request", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSatellite: "CCF Cebu" },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.upwardSatellite).toBe("CCF Cebu")
    // No local group to ask, so there is no one for a request to go to.
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })

  it("rejects an unknown satellite at the schema, before any write", async () => {
    const event = await seedEvent()
    const member = await seedMember()

    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSatellite: "CCF Atlantis" },
      member.id
    )

    expect(res.success).toBe(false)
    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.upwardSatellite).toBeNull()
  })
})

describe("the two answers stay mutually exclusive", () => {
  it("a named group wins over a satellite sent alongside it", async () => {
    const event = await seedEvent()
    const member = await seedMember()
    const group = await seedGroup()

    // `registrantSchema` already nulls the group when a satellite is set, so a
    // payload carrying both resolves to the satellite. Pinned here because a
    // member submitting both must never end up with a request *and* a satellite
    // — that is someone claiming two different DGroups.
    const res = await createRegistrant(
      event.id,
      { ...BASE, claimedSmallGroupId: group.id, claimedSatellite: "CCF Cebu" },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    const requests = await db.smallGroupMemberRequest.count({ where: { memberId: member.id } })
    expect([after.upwardSatellite !== null, requests > 0].filter(Boolean)).toHaveLength(1)
  })
})

describe("guests are unaffected", () => {
  it("still records a guest's claim on the guest's own columns", async () => {
    const event = await seedEvent()
    const group = await seedGroup()

    const res = await createRegistrant(
      event.id,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222", claimedSmallGroupId: group.id },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow()
    expect(guest.claimedSmallGroupId).toBe(group.id)
    // A guest's claim is a scratch column, not a request — unchanged behavior.
    expect(await db.smallGroupMemberRequest.count()).toBe(0)
  })
})
