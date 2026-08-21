import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

/**
 * The dedup ladder finds a returning guest; matching then has to *use* what it
 * found.
 *
 * `resolveAnonymousGuest` matches on phone → email → last name + birthday and
 * has the guest's stored profile in hand, but the registration action used to
 * build the breakout profile from the submitted payload alone
 * (`parsed.data.gender ?? null`). So a guest we had already met — gender, birth
 * year and life stage all on file — was placed as though we knew nothing about
 * them, and every gendered table dropped out of their suggestion.
 *
 * It bit hardest on a form with Gender switched off, since the payload then
 * carries no gender by construction (`sanitizeRegistrantPayload`), but the bug
 * was never conditional on that: any answer left blank had the same effect.
 *
 * The two confirmed branches already merged form-answer-over-stored; this pins
 * the third doing the same.
 */

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventFormConfig", "EventRegistrant", "Event", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const MOBILE = "+63 917 123 4567"

/** Auto-assign on, so placement runs with no picker and no human in the loop. */
async function seedEvent() {
  const event = await db.event.create({
    data: {
      name: "Retreat",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
      autoAssignBreakout: true,
    },
  })
  await db.eventModule.create({ data: { eventId: event.id, type: "Breakout" } })
  return event
}

const walkUpPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Juan",
  lastName: "dela Cruz",
  mobileNumber: MOBILE,
  ...overrides,
})

describe("a matched guest's stored profile reaches breakout placement", () => {
  it("seats a returning guest at their gendered table though the form asked no gender", async () => {
    const event = await seedEvent()
    const mens = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Men's Table", genderFocus: "Male" },
    })
    await db.guest.create({
      data: { firstName: "Juan", lastName: "dela Cruz", phone: MOBILE, gender: "Male", language: [] },
    })

    const result = await createRegistrant(event.id, walkUpPayload(), null)
    expect(result.success).toBe(true)

    const seat = await db.breakoutGroupMember.findFirst({
      where: { breakoutGroup: { eventId: event.id } },
      select: { breakoutGroupId: true },
    })
    // Previously null: gender read as unknown, so the only table was ineligible
    // and auto-assign placed nobody at all.
    expect(seat?.breakoutGroupId).toBe(mens.id)
  })

  it("uses a matched guest's life stage to break the tie when gender is unknown", async () => {
    const event = await seedEvent()
    const singles = await db.lifeStage.create({ data: { name: "Singles", order: 1 } })
    // Open Table first, so declaration order alone would win it — only the life
    // stage recovered from the matched guest moves the answer to Singles.
    await db.breakoutGroup.create({ data: { eventId: event.id, name: "Open Table" } })
    const singlesTable = await db.breakoutGroup.create({
      data: {
        eventId: event.id,
        name: "Singles Table",
        lifeStages: { connect: [{ id: singles.id }] },
      },
    })
    await db.guest.create({
      data: {
        firstName: "Juan",
        lastName: "dela Cruz",
        phone: MOBILE,
        lifeStageId: singles.id,
        language: [],
      },
    })

    const result = await createRegistrant(event.id, walkUpPayload(), null)
    expect(result.success).toBe(true)

    const seat = await db.breakoutGroupMember.findFirst({
      where: { breakoutGroup: { eventId: event.id } },
      select: { breakoutGroupId: true },
    })
    expect(seat?.breakoutGroupId).toBe(singlesTable.id)
  })

  it("lets a fresh answer win over the stored one", async () => {
    // Fill-if-empty governs what gets *written* to the guest; matching is the
    // other direction — the answer just given describes them now.
    const event = await seedEvent()
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldGender: true },
    })
    const womens = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Women's Table", genderFocus: "Female" },
    })
    await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Men's Table", genderFocus: "Male" },
    })
    await db.guest.create({
      data: { firstName: "Juan", lastName: "dela Cruz", phone: MOBILE, gender: "Male", language: [] },
    })

    const result = await createRegistrant(event.id, walkUpPayload({ gender: "Female" }), null)
    expect(result.success).toBe(true)

    const seat = await db.breakoutGroupMember.findFirst({
      where: { breakoutGroup: { eventId: event.id } },
      select: { breakoutGroupId: true },
    })
    expect(seat?.breakoutGroupId).toBe(womens.id)
  })

  it("creates no second guest — the ladder still deduplicates", async () => {
    const event = await seedEvent()
    await db.guest.create({
      data: { firstName: "Juan", lastName: "dela Cruz", phone: MOBILE, gender: "Male", language: [] },
    })

    await createRegistrant(event.id, walkUpPayload(), null)

    expect(await db.guest.count()).toBe(1)
  })

  it("places a brand-new guest exactly as before", async () => {
    // Nothing on file and nothing asked: the profile is genuinely empty, the
    // gendered table stays ineligible, and the open one takes them.
    const event = await seedEvent()
    await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Men's Table", genderFocus: "Male" },
    })
    const open = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Open Table" },
    })

    const result = await createRegistrant(event.id, walkUpPayload(), null)
    expect(result.success).toBe(true)

    const seat = await db.breakoutGroupMember.findFirst({
      where: { breakoutGroup: { eventId: event.id } },
      select: { breakoutGroupId: true },
    })
    expect(seat?.breakoutGroupId).toBe(open.id)
  })
})
