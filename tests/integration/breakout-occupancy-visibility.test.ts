import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"

/**
 * CCF-141 — who is allowed to see breakout headcounts, and who is allowed to
 * push a group past its limit.
 *
 * The walk-in route is public (`PUBLIC_PATTERNS`), so "this came from the door"
 * is a claim the request makes about itself. Both privileges therefore hang off
 * an actual session, not off the surface. These tests drive the real server
 * action with the session mocked signed-out and signed-in, because the whole
 * point is what a crafted POST from a stranger with the URL can get.
 */

const authMock = vi.hoisted(() => ({ session: null as unknown }))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => authMock.session),
}))

import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { withoutOccupancy } from "@/lib/breakout-suggestion"
import { fetchBreakoutAvailability } from "@/lib/breakout-suggestion-server"

const SIGNED_OUT = null
const EVENT_STAFF = { user: { id: "u1", role: "SuperAdmin" } }

beforeEach(async () => {
  authMock.session = SIGNED_OUT
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventFormConfig", "EventRegistrant", "OccurrenceAttendee", "EventOccurrence", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

/** An event whose walk-in form offers the breakout picker. */
async function seedEvent() {
  const event = await db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  await db.eventModule.create({ data: { eventId: event.id, type: "Breakout" } })
  await db.eventFormConfig.create({
    data: { eventId: event.id, context: "WalkIn", sectionBreakout: true },
  })
  return event
}

/** A group with `memberLimit` seats, all of them taken. */
async function seedFullGroup(eventId: string) {
  const group = await db.breakoutGroup.create({
    data: { eventId, name: "Alpha", memberLimit: 1 },
  })
  const sitting = await db.eventRegistrant.create({
    data: { eventId, firstName: "Ana", lastName: "Sitting" },
  })
  await db.breakoutGroupMember.create({
    data: { breakoutGroupId: group.id, registrantId: sitting.id },
  })
  return group
}

const WALK_IN = { occurrenceId: null }

function person(mobileNumber: string) {
  return { firstName: "Ben", lastName: "Tester", mobileNumber }
}

describe("the capacity override is a privilege of the session, not of the route", () => {
  it("lets signed-in event staff place someone into a full group", async () => {
    const event = await seedEvent()
    const group = await seedFullGroup(event.id)
    authMock.session = EVENT_STAFF

    const result = await createRegistrant(
      event.id,
      person("09171234567"),
      null,
      null,
      false,
      group.id,
      WALK_IN
    )

    expect(result.success).toBe(true)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(2)
  })

  it("refuses the same pick from an anonymous request to the public walk-in route", async () => {
    const event = await seedEvent()
    const group = await seedFullGroup(event.id)
    authMock.session = SIGNED_OUT

    // Byte-for-byte the staff submission above, minus the session.
    const result = await createRegistrant(
      event.id,
      person("09181234567"),
      null,
      null,
      false,
      group.id,
      WALK_IN
    )

    // The registration still succeeds — only the over-capacity placement is denied.
    expect(result.success).toBe(true)
    expect(result.success === true && result.data.breakoutGroup).toBeNull()
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(1)
  })

  it("does not hand the override to staff who are merely pre-registering", async () => {
    // Signed in, but no `walkIn`: the Register form never offers a full group,
    // so honouring a pick at one would contradict the UI that produced it.
    const event = await seedEvent()
    const group = await seedFullGroup(event.id)
    authMock.session = EVENT_STAFF

    const result = await createRegistrant(
      event.id,
      person("09191234567"),
      null,
      null,
      false,
      group.id
    )

    expect(result.success).toBe(true)
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(1)
  })
})

describe("headcounts withheld from an anonymous viewer", () => {
  it("keeps isFull while dropping the raw counts", async () => {
    const event = await seedEvent()
    await seedFullGroup(event.id)
    await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Beta", memberLimit: 12 },
    })

    const { candidates } = await fetchBreakoutAvailability(event.id, null, false)
    const anonymous = withoutOccupancy(candidates)

    // Every group loses its numbers...
    expect(anonymous.every((c) => c.occupancy === null)).toBe(true)
    // ...and none of them smuggles a count back through another field.
    expect(JSON.stringify(anonymous)).not.toContain("memberCount")

    // ...but "is this one full?" survives, because that is a fact about the
    // choice in front of the registrant rather than an occupancy figure.
    expect(anonymous.find((c) => c.name === "Alpha")?.isFull).toBe(true)
    expect(anonymous.find((c) => c.name === "Beta")?.isFull).toBe(false)
  })

  it("still gives the staffed read the real numbers", async () => {
    const event = await seedEvent()
    await seedFullGroup(event.id)

    const { candidates } = await fetchBreakoutAvailability(event.id, null, false)

    expect(candidates.find((c) => c.name === "Alpha")?.occupancy).toEqual({
      memberCount: 1,
      memberLimit: 1,
    })
  })
})
