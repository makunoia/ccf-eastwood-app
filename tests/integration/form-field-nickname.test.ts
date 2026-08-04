/**
 * Nickname as a configurable registration form field — end to end through
 * `createRegistrant`.
 *
 * The unit tests pin the sanitizer in isolation; these pin that the sanitizer is
 * actually wired into the public write path, for both contexts and for a guest
 * that already exists. Registration is a public endpoint, so "the form withheld
 * it" is not enforcement — the server has to drop it.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "Event", "EventRegistrant", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(nicknameOn: boolean, context: "Register" | "WalkIn" = "Register") {
  const event = await db.event.create({
    data: {
      name: "Youth Camp",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
  })
  await db.eventFormConfig.create({
    data: { eventId: event.id, context, fieldNickname: nicknameOn },
  })
  return event
}

describe("public registration — the nickname field toggle", () => {
  it("stores the nickname when the field is on", async () => {
    const event = await seedEvent(true)

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      null
    )
    expect(res.success).toBe(true)

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(registrant.nickname).toBe("Jun")
  })

  it("drops a crafted nickname when the field is off", async () => {
    const event = await seedEvent(false)

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      null
    )
    expect(res.success).toBe(true)

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(registrant.nickname).toBeNull()
  })

  it("reads the Walk-in config for a walk-in, not Register's", async () => {
    // Walk-in and Register are configured independently, and a walk-in goes
    // through the same action with `walkIn` set.
    const event = await seedEvent(false, "WalkIn")
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldNickname: true },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      null,
      undefined,
      undefined,
      undefined,
      { occurrenceId: null }
    )
    expect(res.success).toBe(true)

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(registrant.nickname).toBeNull()
  })

  it("never erases the nickname an existing guest already has", async () => {
    // Turning the toggle off neutralises the payload; it must not null out data
    // collected while the field was on.
    const event = await seedEvent(false)
    const guest = await db.guest.create({
      data: {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        phone: "+63 917 123 4567",
        language: [],
      },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        mobileNumber: "09171234567",
      },
      null
    )
    expect(res.success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(after.nickname).toBe("Jun")
  })

  it("fills a confirmed member's empty nickname instead of discarding it", async () => {
    // Only the anonymous branch puts a nickname on `EventRegistrant`, so someone
    // who confirms as an existing member used to have their answer dropped.
    const event = await seedEvent(true)
    const member = await db.member.create({
      data: {
        firstName: "Junior",
        lastName: "Santos",
        dateJoined: new Date(),
        language: [],
      },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.nickname).toBe("Jun")
  })

  it("never overwrites a nickname the member already has", async () => {
    const event = await seedEvent(true)
    const member = await db.member.create({
      data: {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        dateJoined: new Date(),
        language: [],
      },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "JR",
        mobileNumber: "09171234567",
      },
      member.id
    )

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.nickname).toBe("Jun")
  })

  it("fills a confirmed guest's empty nickname too", async () => {
    const event = await seedEvent(true)
    const guest = await db.guest.create({
      data: { firstName: "Junior", lastName: "Santos", language: [] },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      null,
      guest.id
    )

    const after = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(after.nickname).toBe("Jun")
  })

  it("does not fill a confirmed member's nickname when the field is off", async () => {
    // The gate runs before the resolver, so a crafted value never reaches the
    // profile write either.
    const event = await seedEvent(false)
    const member = await db.member.create({
      data: {
        firstName: "Junior",
        lastName: "Santos",
        dateJoined: new Date(),
        language: [],
      },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      member.id
    )

    const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.nickname).toBeNull()
  })

  it("treats an event with no stored config as not asking for a nickname", async () => {
    // "Bare by default" — a missing row collects nothing optional. Events that
    // predate the toggle were given a row by the migration instead.
    const event = await db.event.create({
      data: {
        name: "Bare Event",
        type: "OneTime",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-01"),
      },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Junior",
        lastName: "Santos",
        nickname: "Jun",
        mobileNumber: "09171234567",
      },
      null
    )
    expect(res.success).toBe(true)

    const registrant = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(registrant.nickname).toBeNull()
  })
})
